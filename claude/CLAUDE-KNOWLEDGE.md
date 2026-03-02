# CLAUDE KNOWLEDGE

## Q: What is already available in this repo's AKS setup for HTTPS ingress?
A: `ingress-nginx` and `cert-manager` are installed in-cluster, and a `ClusterIssuer` named `letsencrypt-prod` exists and is `Ready`. New hostnames can be routed by creating an `Ingress` with `ingressClassName: nginx` and annotation `cert-manager.io/cluster-issuer: letsencrypt-prod`.

## Q: How should backend tests override env vars without violating repository lint rules?
A: In `apps/backend`, direct `process.env` access is lint-restricted even in tests. Use Vitest env helpers (`vi.stubEnv(...)` and `vi.unstubAllEnvs()`) instead of assigning to `process.env`.

## Q: What command pattern worked for running focused backend tests in this repo?
A: Use the repository command `pnpm test run <file filters>` (for example `pnpm test run apps/backend/src/lib/js-execution-self-hosted.test.ts ...`) instead of invoking `vitest` directly from `apps/backend`, which can hit local worker pool issues.

## Q: Why did sandbox executions still timeout at 30s even after increasing backend timeout to 90s?
A: `apps/sandbox-api/src/policy.ts` capped request timeout with `SANDBOX_MAX_TIMEOUT_MS = 30000`, so incoming `timeoutMs` was clamped. Fix by making max timeout configurable (for example `STACK_SANDBOX_MAX_TIMEOUT_MS=120000`) and redeploying sandbox-api.

## Q: Why can dashboard auth break after a backend rollout even if pods are healthy?
A: `docker/server/entrypoint.sh` auto-generates internal project keys when `STACK_SEED_INTERNAL_PROJECT_*_KEY` env vars are missing. If keys rotate unexpectedly, dashboard requests fail with `INVALID_SECRET_SERVER_KEY` / OAuth client secret errors. Keep those keys pinned in Kubernetes secrets and always inject them on deploy.
