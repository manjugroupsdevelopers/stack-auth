#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ] || [ "$#" -gt 8 ]; then
  echo "Usage: $0 <primary-host> <replica-host> <db-admin-user> <db-admin-password> <db-name> [namespace] [secret-name] [deployment-name]"
  exit 1
fi

PRIMARY_HOST="$1"
REPLICA_HOST="$2"
DB_USER="$3"
DB_PASSWORD="$4"
DB_NAME="$5"
NAMESPACE="${6:-stack-auth}"
SECRET_NAME="${7:-stack-auth-secrets}"
DEPLOYMENT_NAME="${8:-stack-auth}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to URL-encode password."
  exit 1
fi

ENCODED_PASSWORD="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASSWORD")"

PRIMARY_CONN="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${PRIMARY_HOST}:5432/${DB_NAME}?sslmode=require"
REPLICA_CONN="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${REPLICA_HOST}:5432/${DB_NAME}?sslmode=require"

echo "Updating Kubernetes secret ${SECRET_NAME} in namespace ${NAMESPACE}..."
kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
  --from-literal=stack-database-connection-string="$PRIMARY_CONN" \
  --from-literal=stack-database-replica-connection-string="$REPLICA_CONN" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Setting replication strategy env on deployment ${DEPLOYMENT_NAME}..."
kubectl -n "$NAMESPACE" set env "deployment/${DEPLOYMENT_NAME}" \
  STACK_DATABASE_REPLICATION_WAIT_STRATEGY=pg-stat-replication

echo "Done. Rolling restart deployment ${DEPLOYMENT_NAME}..."
kubectl -n "$NAMESPACE" rollout restart "deployment/${DEPLOYMENT_NAME}"
kubectl -n "$NAMESPACE" rollout status "deployment/${DEPLOYMENT_NAME}" --timeout=300s

cat <<EOF
AKS app now points to Azure primary + replica secrets.

Primary connection secret key: stack-database-connection-string
Replica connection secret key: stack-database-replica-connection-string
Replication strategy: pg-stat-replication
EOF
