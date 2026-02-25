# CI/CD Setup Guide

## Overview

This guide covers setting up automated CI/CD using GitHub Actions to build and deploy to AKS.

## Azure Service Principal

### Create Service Principal

```bash
az ad sp create-for-rbac --name "stack-auth-github" --role contributor --scope /subscriptions/<subscription-id>/resourceGroups/manjuwellness-auth
```

Save the output - you'll need:
- `appId` (client ID)
- `tenant` (tenant ID)

### Get Subscription ID

```bash
az account show --query id -o tsv
```

## GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret Name | Value |
|-------------|-------|
| `AZURE_CLIENT_ID` | Service principal appId |
| `AZURE_TENANT_ID` | Service principal tenant |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID |

## GitHub Workflow

The workflow file is at `.github/workflows/azure-aks-deploy.yaml`.

### What it does:

1. **Trigger**: On push to `main` or `dev` branches
2. **Build**: Builds Docker image using `docker/server/Dockerfile`
3. **Push**: Pushes image to Azure Container Registry with tags:
   - `latest` (for main branch)
   - `<short-sha>` (for both branches)
4. **Deploy**: Updates AKS deployment with new image
5. **Verify**: Waits for rollout to complete

### Manual Trigger

You can also trigger manually from GitHub Actions UI.

## ACR Image Pull Secret

For AKS to pull images from ACR, you need to create an image pull secret:

```bash
kubectl create secret docker-registry acr-secret \
  --docker-server=stackauthacr2025.azurecr.io \
  --docker-username=<client-id> \
  --docker-password=<client-secret> \
  --namespace=stack-auth
```

This is already configured in `k8s/stack-auth.yaml`.

## First-time CI/CD Setup

1. Create Azure Service Principal (see above)
2. Add GitHub Secrets
3. Push code to main/dev branch
4. Workflow will automatically:
   - Build image
   - Push to ACR
   - Deploy to AKS

## Verifying CI/CD

```bash
# Check workflow runs in GitHub Actions
# Check deployment
kubectl get pods -n stack-auth

# Check services
kubectl get svc -n stack-auth
```

## Current Deployment Info

- **ACR Name**: `stackauthacr2025`
- **AKS Cluster**: `stack-auth-aks`
- **Resource Group**: `manjuwellness-auth`
- **Image Tag**: `amd64`

## Troubleshooting

### Workflow fails at build step
- Check Dockerfile exists at `docker/server/Dockerfile`
- Verify ACR name is correct

### Workflow fails at deploy step
- Verify AKS credentials: `az aks get-credentials`
- Check service principal has Contributor role on resource group

### Image pull fails in AKS
- Verify image pull secret exists: `kubectl get secret acr-secret -n stack-auth`
- Check image exists in ACR: `az acr repository list --name stackauthacr2025`
