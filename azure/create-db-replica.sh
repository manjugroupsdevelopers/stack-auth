#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <resource-group> <primary-server-name> <replica-server-name> [location]"
  exit 1
fi

RESOURCE_GROUP="$1"
PRIMARY_SERVER="$2"
REPLICA_SERVER="$3"
LOCATION="${4:-}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required."
  exit 1
fi

echo "Validating source server..."
PRIMARY_STATE="$(az postgres flexible-server show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PRIMARY_SERVER" \
  --query state -o tsv)"

if [ "$PRIMARY_STATE" != "Ready" ]; then
  echo "Primary server is not Ready (state: $PRIMARY_STATE)."
  exit 1
fi

ADMIN_USER="$(az postgres flexible-server show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PRIMARY_SERVER" \
  --query administratorLogin -o tsv)"

echo "Creating replica server '$REPLICA_SERVER' from '$PRIMARY_SERVER'..."
if [ -n "$LOCATION" ]; then
  az postgres flexible-server replica create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REPLICA_SERVER" \
    --source-server "$PRIMARY_SERVER" \
    --location "$LOCATION" \
    --only-show-errors
else
  az postgres flexible-server replica create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REPLICA_SERVER" \
    --source-server "$PRIMARY_SERVER" \
    --only-show-errors
fi

echo "Waiting for replica to be Ready..."
for _ in $(seq 1 60); do
  state="$(az postgres flexible-server show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REPLICA_SERVER" \
    --query state -o tsv)"
  if [ "$state" = "Ready" ]; then
    break
  fi
  sleep 10
done

FINAL_STATE="$(az postgres flexible-server show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REPLICA_SERVER" \
  --query state -o tsv)"

if [ "$FINAL_STATE" != "Ready" ]; then
  echo "Replica did not become Ready (state: $FINAL_STATE)."
  exit 1
fi

PRIMARY_FQDN="$(az postgres flexible-server show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$PRIMARY_SERVER" \
  --query fullyQualifiedDomainName -o tsv)"
REPLICA_FQDN="$(az postgres flexible-server show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REPLICA_SERVER" \
  --query fullyQualifiedDomainName -o tsv)"

cat <<EOF
Replica created successfully.

Primary server: $PRIMARY_FQDN
Replica server: $REPLICA_FQDN
Admin user: $ADMIN_USER

Next step:
1) Update app DB secret with both connection strings.
2) Set STACK_DATABASE_REPLICATION_WAIT_STRATEGY=pg-stat-replication.
3) Run scripts/verify-db-replica.sh against the Azure primary + replica URLs.
EOF
