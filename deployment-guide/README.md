# Stack Auth Deployment Guide

## Overview

This guide covers deploying Stack Auth to Azure Kubernetes Service (AKS) with Azure Container Registry (ACR).

## Architecture

```
GitHub → ACR (Container Registry) → AKS (Kubernetes) → LoadBalancer Services
```

## Prerequisites

- Azure Subscription
- Azure CLI installed
- kubectl installed
- Docker installed

## Quick Start

### 1. Azure Resources (Already Created)

If starting fresh, run:
```bash
# Set your subscription
az account set --subscription <subscription-id>

# Create resource group
az group create --name manjuwellness-auth --location centralindia

# Create ACR
az acr create --resource-group manjuwellness-auth --name stackauthacr2025 --sku Standard

# Create AKS cluster
az aks create --resource-group manjuwellness-auth --name stack-auth-aks --node-count 2 --node-vm-size Standard_D2s_v3 --generate-ssh-keys
```

### 2. Configure kubectl

```bash
az aks get-credentials --resource-group manjuwellness-auth --name stack-auth-aks --overwrite-existing
```

### 3. Apply Kubernetes Manifests

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/stack-auth.yaml
```

### 4. Check Deployment Status

```bash
kubectl get pods -n stack-auth
kubectl get svc -n stack-auth
```

### 5. Access the Application

- **Dashboard:** http://<dashboard-external-ip>
- **Backend API:** http://<backend-external-ip>

## Building and Pushing Docker Image

### Step 1: Login to Azure

```bash
# Login to Azure
az login

# Set correct subscription
az account set --subscription a6d44e3b-94d3-497c-bc38-07a9ec0faf63

# Login to ACR
az acr login --name stackauthacr2025
```

### Step 2: Build and Push

#### Option A: Local Build (Recommended)

```bash
# Get current git commit SHA for version tag
TAG=$(git rev-parse --short HEAD)

# Build for amd64 platform (required for AKS)
docker build --platform linux/amd64 -f docker/server/Dockerfile \
  -t stackauthacr2025.azurecr.io/stack-auth/server:$TAG .

# Push with git SHA tag
docker push stackauthacr2025.azurecr.io/stack-auth/server:$TAG

# Also tag as amd64 (used by K8s deployment)
docker tag stackauthacr2025.azurecr.io/stack-auth/server:$TAG \
  stackauthacr2025.azurecr.io/stack-auth/server:amd64

docker push stackauthacr2025.azurecr.io/stack-auth/server:amd64
```

#### Option B: ACR Build

```bash
az acr build \
  --registry stackauthacr2025 \
  --image stack-auth/server:amd64 \
  --file ./docker/server/Dockerfile \
  .
```

### Step 3: Deploy

```bash
# Restart deployment to pull new image
kubectl rollout restart deployment/stack-auth -n stack-auth

# Check rollout status
kubectl rollout status deployment/stack-auth -n stack-auth --timeout=300s

# Verify pods are running
kubectl get pods -n stack-auth
```

### Quick One-Liner

```bash
# Build, push & deploy all at once
docker build --platform linux/amd64 -f docker/server/Dockerfile -t stackauthacr2025.azurecr.io/stack-auth/server:amd64 . && az acr login --name stackauthacr2025 && docker push stackauthacr2025.azurecr.io/stack-auth/server:amd64 && kubectl rollout restart deployment/stack-auth -n stack-auth
```

## Updating Deployment

After building and pushing a new image (see above):

```bash
# Restart deployment to pull latest image
kubectl rollout restart deployment/stack-auth -n stack-auth

# Check rollout status
kubectl rollout status deployment/stack-auth -n stack-auth --timeout=300s

# Verify
kubectl get pods -n stack-auth
```

## Environment Variables

Key environment variables in `k8s/stack-auth.yaml`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_STACK_API_URL` | Public API URL |
| `NEXT_PUBLIC_STACK_DASHBOARD_URL` | Public Dashboard URL |
| `STACK_DATABASE_CONNECTION_STRING` | PostgreSQL connection string |
| `STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED` | Enable sign up |
| `STACK_SKIP_SEED_SCRIPT` | Skip database seeding |

## Data Persistence

**Yes, your data persists across deployments!**

- Database data is stored on Azure PersistentVolume (managed disk)
- Data is preserved when you restart or redeploy the application
- Data will ONLY be lost if you:
  - Delete the PVC: `kubectl delete pvc postgres-pvc -n stack-auth`
  - Delete the namespace: `kubectl delete namespace stack-auth`
  - Delete the AKS node resource group

### Backup Recommendation

For production, set up Azure Backup for the disk:
```bash
# List disks in resource group
az disk list -g MC_manjuwellness-auth_stack-auth-aks_centralindia -o table
```

## CI/CD Setup

See [CI-CD-Guide.md](./CI-CD-Guide.md) for GitHub Actions workflow setup.

## Read Replica Setup

For local-first validation and Azure read-replica rollout, use [AZURE-DB-REPLICA-RUNBOOK.md](./AZURE-DB-REPLICA-RUNBOOK.md).

## Troubleshooting

### Check pod logs
```bash
kubectl logs -n stack-auth <pod-name>
```

### Check pod events
```bash
kubectl describe pod -n stack-auth <pod-name>
```

### Common Issues

1. **ImagePullBackOff**: Check ACR credentials and image pull secret
2. **CrashLoopBackOff**: Check pod logs for errors
3. **Connection refused**: Check if services are running and ports are correct

### Delete all resources

```bash
kubectl delete -f k8s/
az aks delete --name stack-auth-aks --resource-group manjuwellness-auth
az acr delete --name stackauthacr2025
```
