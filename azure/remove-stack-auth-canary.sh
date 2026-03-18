#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-stack-auth}"

kubectl -n "$NAMESPACE" delete deployment stack-auth-canary --ignore-not-found
kubectl -n "$NAMESPACE" delete service stack-auth-canary --ignore-not-found

echo "Canary resources removed from namespace ${NAMESPACE}."
