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

### Option 1: Local Build

```bash
# Build for amd64 platform (required for AKS)
docker build --platform linux/amd64 -f docker/server/Dockerfile -t stackauthacr2025.azurecr.io/stack-auth/server:v1 .

# Login to ACR
az acr login --name stackauthacr2025

# Push to ACR
docker push stackauthacr2025.azurecr.io/stack-auth/server:v1
docker tag stackauthacr2025.azurecr.io/stack-auth/server:v1 stackauthacr2025.azurecr.io/stack-auth/server:latest
docker push stackauthacr2025.azurecr.io/stack-auth/server:latest
```

### Option 2: Using ACR Build

```bash
az acr build --registry stackauthacr2025 --image stack-auth/server:v1 --file ./docker/server/Dockerfile .
```

## Updating Deployment

After pushing a new image:

```bash
# Option 1: Update image tag in k8s/stack-auth.yaml and apply
kubectl apply -f k8s/stack-auth.yaml

# Option 2: Just restart deployment to pull latest image
kubectl rollout restart deployment/stack-auth -n stack-auth

# Check rollout status
kubectl rollout status deployment/stack-auth -n stack-auth
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

## CI/CD Setup

See [CI-CD-Guide.md](./CI-CD-Guide.md) for GitHub Actions workflow setup.

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
