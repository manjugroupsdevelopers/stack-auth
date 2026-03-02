# Self-Hosted Email Sandbox Cutover Runbook (AKS)

## Scope
- Email rendering JS execution only.
- Backend engine mode: `STACK_JS_EXECUTION_ENGINE=self-hosted-sandbox`.
- Fail-closed behavior (no Vercel/Freestyle fallback when self-hosted mode is active).

## Architecture
1. Backend calls `sandbox-api` (`POST /execute`).
2. `sandbox-api` creates a short-lived AKS Job in `stack-auth-sandbox`.
3. `sandbox-runner` executes code, installs allowlisted modules, posts callback.
4. `sandbox-api` normalizes result and returns `ExecuteResult`.
5. Email queue continues with existing `renderError*` semantics.

## What Was Implemented
- Backend:
  - Self-hosted engine branch in JS execution.
  - HTTP client for sandbox execution.
  - Engine-aware readiness checks for send-email route.
- Sandbox service:
  - New `apps/sandbox-api` Express app with `/execute`, `/internal/job-result/:executionId`, `/healthz`, `/metrics`.
  - Runner image under `apps/sandbox-api/runner`.
  - Job orchestration via `@kubernetes/client-node`.
- AKS:
  - `stack-auth-sandbox` namespace + RBAC + service + deployment + network policies.
  - Backend envs for self-hosted sandbox.
- CI/CD:
  - New production workflow: `.github/workflows/deploy-prod.yml`.

## Required GitHub Secrets (for `deploy-prod.yml`)
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `STACK_SERVER_SECRET`
- `STACK_SANDBOX_API_TOKEN`
- `STACK_SANDBOX_CALLBACK_TOKEN`
- `STACK_INTERNAL_PROJECT_PUBLISHABLE_CLIENT_KEY`
- `STACK_INTERNAL_PROJECT_SECRET_SERVER_KEY`
- `STACK_INTERNAL_PROJECT_SUPER_SECRET_ADMIN_KEY`

## Production Defaults
- Backend:
  - `STACK_JS_EXECUTION_ENGINE=self-hosted-sandbox`
  - `STACK_SANDBOX_TIMEOUT_MS=90000`
  - `STACK_SKIP_MIGRATIONS=true`
  - `STACK_SKIP_SEED_SCRIPT=true`
- Sandbox API:
  - `STACK_SANDBOX_RUNNER_ACTIVE_DEADLINE_SECONDS=120`
  - `STACK_SANDBOX_MAX_TIMEOUT_MS=120000`
  - `STACK_SANDBOX_JOB_TTL_SECONDS=120`

## Critical Lessons / Fixes Applied
1. Runner image pull in sandbox namespace:
   - Ensure `acr-secret` exists in `stack-auth-sandbox`.
2. Runner filesystem constraints:
   - Set writable npm paths in job env:
     - `HOME=/tmp`
     - `npm_config_cache=/tmp/.npm`
3. Runner network egress:
   - Allow DNS (TCP/UDP 53 to `kube-system`) and HTTPS (TCP 443) for runtime npm install.
4. Timeout clamping bug:
   - `apps/sandbox-api/src/policy.ts` previously capped timeout to `30000`.
   - Now configurable via `STACK_SANDBOX_MAX_TIMEOUT_MS` (default `120000`).
5. Dashboard auth break after restart:
   - If `STACK_SEED_INTERNAL_PROJECT_*_KEY` envs are missing, entrypoint generates random keys and breaks dashboard auth.
   - Keys must be pinned and persisted in secrets.
6. Data safety on rollout:
   - Keep `STACK_SKIP_MIGRATIONS=true` and `STACK_SKIP_SEED_SCRIPT=true` during regular app rollouts.

## Validation Checklist
1. Deploys rolled out:
   - `kubectl rollout status deployment/stack-auth -n stack-auth`
   - `kubectl rollout status deployment/sandbox-api -n stack-auth-sandbox`
2. Env validation:
   - Backend has `STACK_SANDBOX_TIMEOUT_MS=90000`.
   - Sandbox has `STACK_SANDBOX_MAX_TIMEOUT_MS=120000`.
3. Smoke execution:
   - `/execute` returns `{status:"ok"}` for a minimal function.
4. End-to-end:
   - Signup/resend returns 200.
   - Outbox row transitions to `SENT` (or explicit `RENDER_ERROR` on failures).

## Fast Troubleshooting
- No email received:
  - Check latest outbox rows:
    - `SELECT "createdAt","id","status","renderErrorInternalMessage","sendServerErrorInternalMessage" FROM "EmailOutbox" ORDER BY "createdAt" DESC LIMIT 20;`
- Runner jobs stuck/failing:
  - `kubectl get jobs -n stack-auth-sandbox`
  - `kubectl get pods -n stack-auth-sandbox -l app.kubernetes.io/name=sandbox-runner`
- Sandbox API health:
  - `kubectl logs deploy/sandbox-api -n stack-auth-sandbox --since=10m`
- Backend render failures:
  - `kubectl logs deploy/stack-auth -n stack-auth --since=10m | rg 'render-email|email-queue-step-rendering-error|timed out'`

## Rollback
1. Set backend engine to legacy:
   - `kubectl -n stack-auth set env deployment/stack-auth STACK_JS_EXECUTION_ENGINE=legacy`
2. Rollout:
   - `kubectl rollout status deployment/stack-auth -n stack-auth`
3. Keep sandbox infra deployed for debugging, then remove after stabilization window.
