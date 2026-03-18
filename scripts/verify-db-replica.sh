#!/usr/bin/env bash
set -euo pipefail

PRIMARY_DB_URL="${STACK_DATABASE_CONNECTION_STRING:-${PRIMARY_DB_URL:-}}"
REPLICA_DB_URL="${STACK_DATABASE_REPLICA_CONNECTION_STRING:-${REPLICA_DB_URL:-}}"
TIMEOUT_SECONDS="${REPLICA_CHECK_TIMEOUT_SECONDS:-90}"
POLL_SECONDS="${REPLICA_CHECK_POLL_SECONDS:-2}"
PROBE_TABLE="stack_replica_health_probe"

if command -v psql >/dev/null 2>&1; then
  PSQL_EXEC="local"
elif command -v docker >/dev/null 2>&1; then
  PSQL_EXEC="docker"
else
  echo "Either psql or docker is required to run replica verification."
  exit 1
fi

if [ -z "$PRIMARY_DB_URL" ]; then
  echo "Missing primary DB URL. Set STACK_DATABASE_CONNECTION_STRING or PRIMARY_DB_URL."
  exit 1
fi

if [ -z "$REPLICA_DB_URL" ]; then
  echo "Missing replica DB URL. Set STACK_DATABASE_REPLICA_CONNECTION_STRING or REPLICA_DB_URL."
  exit 1
fi

if [ "$POLL_SECONDS" -le 0 ]; then
  echo "REPLICA_CHECK_POLL_SECONDS must be > 0."
  exit 1
fi

probe_id="replica-probe-$(date +%s)-$RANDOM"
start_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

run_psql() {
  local db_url="$1"
  local sql="$2"

  if [ "$PSQL_EXEC" = "local" ]; then
    psql "$db_url" -v ON_ERROR_STOP=1 -X -qAt -c "$sql"
    return
  fi

  docker run --rm postgres:15 \
    psql "$db_url" -v ON_ERROR_STOP=1 -X -qAt -c "$sql"
}

echo "Checking primary and replica connectivity..."
run_psql "$PRIMARY_DB_URL" "SELECT current_database();"
run_psql "$REPLICA_DB_URL" "SELECT current_database();"

echo "Preparing probe table on primary..."
run_psql "$PRIMARY_DB_URL" "CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (probe_id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT NOT NULL);"

echo "Inserting probe row on primary..."
run_psql "$PRIMARY_DB_URL" "INSERT INTO ${PROBE_TABLE} (probe_id, source) VALUES ('${probe_id}', 'replica-check') ON CONFLICT (probe_id) DO NOTHING;"

primary_lsn="$(run_psql "$PRIMARY_DB_URL" "SELECT pg_current_wal_lsn()::text;")"
echo "Primary WAL LSN at insert: ${primary_lsn}"

echo "Waiting for probe row to appear on replica (timeout: ${TIMEOUT_SECONDS}s)..."
deadline=$((SECONDS + TIMEOUT_SECONDS))
seen_on_replica=0

while [ "$SECONDS" -lt "$deadline" ]; do
  row_found="$(run_psql "$REPLICA_DB_URL" "SELECT 1 FROM ${PROBE_TABLE} WHERE probe_id = '${probe_id}' LIMIT 1;" || true)"
  if [ "$row_found" = "1" ]; then
    seen_on_replica=1
    break
  fi
  sleep "$POLL_SECONDS"
done

if [ "$seen_on_replica" -ne 1 ]; then
  echo "Replica did not catch up within ${TIMEOUT_SECONDS}s."
  exit 1
fi

replica_lsn="$(run_psql "$REPLICA_DB_URL" "SELECT pg_last_wal_replay_lsn()::text;")"
replica_recovery_mode="$(run_psql "$REPLICA_DB_URL" "SELECT pg_is_in_recovery();")"
replica_tx_read_only="$(run_psql "$REPLICA_DB_URL" "SHOW transaction_read_only;")"

echo "Replica replay LSN: ${replica_lsn}"
echo "Replica in recovery mode: ${replica_recovery_mode}"
echo "Replica transaction_read_only: ${replica_tx_read_only}"

echo "Checking write protection on replica..."
if run_psql "$REPLICA_DB_URL" "INSERT INTO ${PROBE_TABLE} (probe_id, source) VALUES ('${probe_id}-replica-write', 'replica-check');" >/dev/null 2>&1; then
  echo "Replica accepted writes unexpectedly."
  exit 1
fi

echo "Replica health check passed."
echo "Probe inserted at: ${start_ts}"
