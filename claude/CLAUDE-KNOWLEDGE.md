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

## Q: Why were self-hosted sandbox email renders taking ~30-70 seconds in production?
A: The runner was doing `npm install --no-save` for allowlisted modules inside every ephemeral job (`apps/sandbox-api/runner/index.mjs`), so each render paid package download/install + cold start cost. Pre-baking allowlisted dependencies into the runner image and removing per-request install is the key latency reduction.

## Q: Does this repo already have a user block/restrict API?
A: There is no dedicated `block` endpoint, but there is a server-side user restriction API through the generic users CRUD. `POST /api/v1/users` and `PATCH /api/v1/users/:id` accept `restricted_by_admin`, `restricted_by_admin_reason`, and `restricted_by_admin_private_details` (`packages/stack-shared/src/interface/crud/users.ts`). The backend persists those fields in `apps/backend/src/app/api/latest/users/crud.tsx`, and restricted users are filtered from list/get flows unless callers opt into `include_restricted` or explicitly allow restricted access.

## Q: How are backend migration tests discovered in this repo?
A: `apps/backend/src/auto-migrations/migration-tests.test.ts` scans every `apps/backend/prisma/migrations/<migration>/tests/*.ts|*.js` file and runs each module's optional `preMigration` and `postMigration` hooks around that migration. Running the test file directly under `prisma/migrations/.../tests` does not work with Vitest's include config; use the migration harness test instead.

## Q: Does this repo already support primary/replica DB wiring in backend runtime?
A: Yes. Backend already reads `STACK_DATABASE_CONNECTION_STRING` and optional `STACK_DATABASE_REPLICA_CONNECTION_STRING` in `apps/backend/src/prisma-client.tsx`, and it can wait for replica catch-up with `STACK_DATABASE_REPLICATION_WAIT_STRATEGY=pg-stat-replication` (or `aurora`).

## Q: Is there already a local Docker replica environment for Postgres?
A: Yes. `docker/dependencies/docker.compose.yaml` already defines `db` (primary) and `db-replica` (streaming replica). Default local ports are `${NEXT_PUBLIC_STACK_PORT_PREFIX:-81}28` for primary and `${NEXT_PUBLIC_STACK_PORT_PREFIX:-81}34` for replica, and `wal-info` is available on `${NEXT_PUBLIC_STACK_PORT_PREFIX:-81}38`.

## Q: How does the new blocked-email API behave for repeated blocks and existing users?
A: `POST /api/v1/blocked-emails` upserts by `(tenancyId, normalizedEmail)` (updates reasons/details instead of duplicating). Blocking an email immediately sets `restricted_by_admin` on any existing user with that email and records a marker in `restricted_by_admin_private_details`. Unblocking removes only that marker and clears admin restriction only when no marker/details remain and the reason matches, preserving unrelated restrictions.
