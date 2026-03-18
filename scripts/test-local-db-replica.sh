#!/usr/bin/env bash
set -euo pipefail

PORT_PREFIX="${NEXT_PUBLIC_STACK_PORT_PREFIX:-81}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run local replica tests."
  exit 1
fi

echo "Starting local primary + replica containers..."
docker compose -p "stack-dependencies-${PORT_PREFIX}" -f docker/dependencies/docker.compose.yaml up -d --build db db-replica wal-info

export STACK_DATABASE_CONNECTION_STRING="postgres://postgres:PASSWORD-PLACEHOLDER--uqfEC1hmmv@localhost:${PORT_PREFIX}28/stackframe"
export STACK_DATABASE_REPLICA_CONNECTION_STRING="postgres://postgres:PASSWORD-PLACEHOLDER--uqfEC1hmmv@localhost:${PORT_PREFIX}34/stackframe"
export REPLICA_CHECK_TIMEOUT_SECONDS="${REPLICA_CHECK_TIMEOUT_SECONDS:-120}"

echo "Verifying replication..."
bash ./scripts/verify-db-replica.sh

echo "Local replica test completed successfully."
echo "Optional WAL dashboard: http://localhost:${PORT_PREFIX}38"
