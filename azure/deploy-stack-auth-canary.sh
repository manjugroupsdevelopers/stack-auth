#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-stack-auth}"

echo "Patching DB secret keys for canary env wiring..."
kubectl -n "$NAMESPACE" patch secret stack-auth-secrets --type merge -p '{
  "stringData": {
    "stack-database-connection-string": "postgresql://postgres:password@postgres.stack-auth.svc.cluster.local:5432/stackframe",
    "stack-database-replica-connection-string": "postgresql://postgres:password@postgres.stack-auth.svc.cluster.local:5432/stackframe"
  }
}'

echo "Applying canary deployment + service..."
kubectl apply -f k8s/stack-auth-canary.yaml

echo "Waiting for rollout..."
kubectl -n "$NAMESPACE" rollout status deployment/stack-auth-canary --timeout=300s

echo "Canary is ready."
echo "Port-forward for local testing:"
echo "kubectl -n ${NAMESPACE} port-forward svc/stack-auth-canary 18101:8101 18102:8102"
