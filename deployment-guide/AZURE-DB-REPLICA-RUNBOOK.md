# Azure DB Replica Runbook (Local First)

This runbook gives a local Docker validation path first, then Azure rollout steps.

## 1) Local validation (Docker primary + replica)

Prerequisites:
- Docker running
- `psql` locally optional (script falls back to `docker run postgres:15 psql`)

Run:

```bash
pnpm run test-local-db-replica
```

What this does:
- Starts `db`, `db-replica`, and `wal-info` from `docker/dependencies/docker.compose.yaml`
- Uses:
  - Primary: `localhost:8128`
  - Replica: `localhost:8134`
- Runs `scripts/verify-db-replica.sh` to verify:
  - primary write succeeds
  - probe row replicates to replica
  - replica is read-only

Optional UI:
- WAL monitor: `http://localhost:8138`

## 2) Create Azure Flexible Server replica

```bash
bash ./azure/create-db-replica.sh <resource-group> <primary-server-name> <replica-server-name> [location]
```

Example:

```bash
bash ./azure/create-db-replica.sh manjuwellness-auth stackauthdb1771923374 stackauthdb1771923374-rr centralindia
```

## 3) Switch AKS app to Azure primary + replica

```bash
bash ./azure/update-aks-db-replica-secret.sh \
  <primary-fqdn> \
  <replica-fqdn> \
  <db-admin-user> \
  <db-admin-password> \
  <db-name> \
  [namespace] \
  [secret-name] \
  [deployment-name]
```

Example:

```bash
bash ./azure/update-aks-db-replica-secret.sh \
  stackauthdb1771923374.postgres.database.azure.com \
  stackauthdb1771923374-rr.postgres.database.azure.com \
  stackadmin \
  '<db-password>' \
  stackframe \
  stack-auth \
  stack-auth-secrets \
  stack-auth
```

This updates secret keys:
- `stack-database-connection-string`
- `stack-database-replica-connection-string`

And sets:
- `STACK_DATABASE_REPLICATION_WAIT_STRATEGY=pg-stat-replication`

## 4) Post-switch verification against Azure

Set env vars and run:

```bash
export STACK_DATABASE_CONNECTION_STRING='postgresql://...primary...'
export STACK_DATABASE_REPLICA_CONNECTION_STRING='postgresql://...replica...'
pnpm run verify-db-replica
```

If this succeeds, app-level read-replica wiring is healthy.
