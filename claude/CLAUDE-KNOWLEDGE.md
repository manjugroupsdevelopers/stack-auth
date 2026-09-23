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

## Q: Does this repo have a completed phone/mobile OTP sign-in flow?
A: It has backend endpoints under `/api/latest/auth/phone-otp` for sending an SMS code, checking a code, and signing in. The implementation stores a `PHONE_OTP` verification code whose first 6 characters are replaced with a numeric SMS OTP and returns the remaining nonce to the client. The self-hosted SMS sender uses the Airix API in production/default deploys and keeps the mock SMS outbox for local/test flows.

## Q: Where should access-token roles come from in Stack Auth?
A: There is no separate role table/model. Roles are represented by team permission IDs, including composed permission definitions such as `team_admin` and custom IDs such as `doctor`. The access-token `roles` claim should be derived from recursive permissions for the user's `selected_team_id`; users without a selected team get `roles: []`.

## Q: What was needed to complete and verify the mobile/phone OTP flow end to end?
A: Phone OTP needed SDK/client-interface methods, phone contact-channel schema support, a mock SMS provider/outbox for tests, `STACK_`-prefixed SMS envs, and E2E coverage for sign-up, sign-in, disabled OTP/signups, invalid code, and verified phone contact channels. In self-hosted Docker, Next runs in production mode, so mock SMS must be explicitly enabled for dev-only deployments with `STACK_SMS_PROVIDER=mock` and `STACK_ALLOW_MOCK_SMS_IN_PRODUCTION=true`.

## Q: How was the dev Stack Auth deployment verified for a real project keyset?
A: Against `https://auth-api-dev-stack.aivida.in`, use the project publishable key plus `x-stack-access-type: client` and `x-stack-project-id`; server operations also require `x-stack-secret-server-key`. Phone OTP sign-in posts only `{ "code": "<6 digit OTP><nonce>" }`; the phone number is stored in the verification-code method from `/api/v1/auth/phone-otp/send-code`. If the project has `"auth.otp.allowSignIn": false` in `EnvironmentConfigOverride`, send-code returns 403 until OTP is enabled for that dev project.

## Q: How should self-hosted Stack Auth send phone OTP SMS through Airix?
A: `send-code` calls `sendOtpSms`, whose production/default sender is Airix. Set `STACK_SMS_PROVIDER=airix`, `STACK_AIRIX_SMS_API_URL=https://api-mfpl.theairix.com/api/integrations/otp/send`, and `STACK_AIRIX_SMS_API_KEY` from a runtime secret. The provider sends JSON `{ phone, otp }`, stripping a leading `+` from E.164 phone numbers, and optionally includes `STACK_AIRIX_SMS_APP_ID` and `STACK_AIRIX_SMS_MESSAGE_TYPE`. In AKS the API key is expected at `stack-auth-secrets` key `stack-airix-sms-api-key`.

## Q: How can session replay log noise be disabled in self-hosted dev dashboard deployments?
A: The dashboard now reads `NEXT_PUBLIC_STACK_SESSION_REPLAYS_ENABLED`; setting it to `false` disables client session replay recording while preserving the default enabled behavior. This is useful when the dev stack has no `STACK_S3_PRIVATE_BUCKET`, otherwise browser sessions can repeatedly hit `/api/v1/session-replays/batch` and log 503 storage-not-configured errors.

## Q: Where is primary email verification stored for Aivida prod users?
A: `primary_email_verified` is derived from the primary `ContactChannel` row (`type = 'EMAIL'`, `isPrimary = 'TRUE'`) and its `isVerified` boolean. For Aivida Prod project `cccf42db-d070-4e81-86fb-e612e9ee427f`, tenancy `27c4c60a-a690-4bbd-bbc8-ff293f30ccc4`, there were 78 unverified primary auth email channels on 2026-08-15. Marking emails verified means setting those `ContactChannel.isVerified` values to `true`, preferably with a backup/count query first.

## Q: How is the separate dev Stack Auth deployment updated on the Aivida server?
A: Sync the repo to `/home/hpmms/devops/stack-auth/build-src`, build `docker/server/Dockerfile` on `hpmms@172.168.1.59`, set `TAG=<new dev tag>` in `/home/hpmms/devops/stack-auth/dev/stack-auth-dev.env`, then run `docker compose --env-file dev/stack-auth-dev.env -f docker-compose.dev-stack-auth.yml up -d --no-deps stack-auth-dev`. The separate dev stack serves dashboard on port `9101` at `https://auth-dev-stack.aivida.in` and API on port `9102` at `https://auth-api-dev-stack.aivida.in`; dev phone OTP uses `STACK_SMS_PROVIDER=mock`.

## Q: How does the Bhash plus WhatsApp phone OTP provider work for Aivida dev?
A: `STACK_SMS_PROVIDER=bhash-whatsapp` keeps the public Stack Auth phone OTP endpoints unchanged while sending each OTP to both Bhash SMS and Airix WhatsApp. Bhash is called with `GET https://bhashsms.com/api/sendmsg.php` using URL params `user`, `pass`, `sender`, `phone`, `text`, `priority`, and `stype`; for Indian E.164 numbers the provider strips `+91` and sends the 10-digit domestic number. A successful Bhash submission returns whitespace-separated IDs starting with `S.`, while Airix WhatsApp returns JSON with `status: "ok"` and a queued message payload.

## Q: How should Aivida send phone OTP through Airtel SMS plus WhatsApp?
A: Use `STACK_SMS_PROVIDER=airtel-whatsapp` to keep the public Stack Auth phone OTP endpoints unchanged while sending each OTP to both Airtel SMS and Airix WhatsApp. Airtel is called with `POST https://iqsms.airtel.in/api/v1/send-prepaid-sms` and JSON fields `customerId`, `destinationAddress` (E.164 phone, including `+91`), `dltTemplateId`, `entityId`, `message`, `messageType`, and `sourceAddress`. For the current Aivida DLT template, set `STACK_PHONE_OTP_LENGTH=4` and `STACK_SMS_OTP_MESSAGE_TEMPLATE={otp} is the OTP to signup on AIVIDA. Valid for 10 minutes. Do not share this with anyone.`; Airtel returned 401 for 6-digit OTP messages but accepted 4-digit OTP messages from the server egress IP `14.195.182.202`.

## Q: How should Aivida send 6-digit OTPs through Airtel after DLT template approval?
A: Use Airtel DLT template `1077324490091202100` with `STACK_PHONE_OTP_LENGTH=6` and `STACK_SMS_OTP_MESSAGE_TEMPLATE=Manju Wellness LLP: Your AIVIDA signup verification OTP is {otp}. This OTP is valid for 10 minutes. Please do not share this OTP with anyone.`. Airtel accepted this message from the prod host, but rejected Node fetch/undici from inside the prod container with 401, so set `STACK_AIRTEL_SMS_TRANSPORT=node-https` to send the same JSON through Node's classic HTTPS client while keeping `STACK_SMS_PROVIDER=airtel-whatsapp`.
