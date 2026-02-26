# Deploy Any Project to Azure AKS

This guide explains how to deploy any Node.js/Docker project to Azure Kubernetes Service.

---

## 1. Create Azure Resources

### Login to Azure
```bash
az login
az account set --subscription <subscription-id>
```

### Create Resource Group
```bash
az group create --name <resource-group-name> --location <location>
# Example: az group create --name myapp-rg --location centralindia
```

### Create Container Registry (ACR)
```bash
az acr create --resource-group <rg-name> --name <acr-name> --sku Standard
# Example: az acr create --resource-group myapp-rg --name myappacr --sku Standard
```

### Create AKS Cluster
```bash
az aks create \
  --resource-group <rg-name> \
  --name <aks-cluster-name> \
  --node-count 2 \
  --node-vm-size Standard_D2s_v3 \
  --generate-ssh-keys
```

---

## 2. Configure kubectl

```bash
az aks get-credentials --resource-group <rg-name> --name <aks-cluster-name> --overwrite-existing
```

Test it:
```bash
kubectl get nodes
```

---

## 3. Create Kubernetes Manifests

### Create namespace
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <app-namespace>
```

### Create deployment
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <app-name>
  namespace: <app-namespace>
spec:
  replicas: 1
  selector:
    matchLabels:
      app: <app-name>
  template:
    metadata:
      labels:
        app: <app-name>
    spec:
      containers:
        - name: <app-name>
          image: <acr-name>.azurecr.io/<app-name>:latest
          ports:
            - containerPort: <port>
          env:
            - name: NODE_ENV
              value: "production"
            # Add your other env vars here
```

### Create service
```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: <app-name>
  namespace: <app-namespace>
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: <container-port>
  selector:
    app: <app-name>
```

### Apply manifests
```bash
kubectl apply -f namespace.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

---

## 4. Build and Push Docker Image

### Option A: Local Build
```bash
# Build for linux/amd64 (required for AKS)
docker build --platform linux/amd64 -f Dockerfile -t <acr-name>.azurecr.io/<app-name>:latest .

# Login to ACR
az acr login --name <acr-name>

# Push to ACR
docker push <acr-name>.azurecr.io/<app-name>:latest
```

### Option B: ACR Build
```bash
az acr build \
  --registry <acr-name> \
  --image <app-name>:latest \
  --file ./Dockerfile \
  .
```

---

## 5. Set Up ACR Pull Permission

AKS needs permission to pull images from ACR:

```bash
# Option 1: Create image pull secret (for private ACR)
kubectl create secret docker-registry acr-secret \
  --docker-server=<acr-name>.azurecr.io \
  --docker-username=<client-id> \
  --docker-password=<client-secret> \
  --namespace=<app-namespace>

# Update deployment to use the secret
# Add to deployment.yaml:
spec:
  template:
    spec:
      imagePullSecrets:
        - name: acr-secret
```

### Option 2: Grant AKS access to ACR (Recommended)
```bash
# Get AKS service principal ID
AKS_SP_ID=$(az aks show -g <rg-name> -n <aks-cluster-name> --query "identity.principalId" -o tsv)

# Assign AcrPull role
az role assignment create \
  --assignee $AKS_SP_ID \
  --role AcrPull \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg-name>/providers/Microsoft.ContainerRegistry/registries/<acr-name>"
```

---

## 6. Update Deployment

After pushing a new image:

```bash
# Option 1: Restart deployment
kubectl rollout restart deployment/<app-name> -n <app-namespace>

# Option 2: Update image manually
kubectl set image deployment/<app-name> <app-name>=<acr-name>.azurecr.io/<app-name>:latest -n <app-namespace>

# Check status
kubectl rollout status deployment/<app-name> -n <app-namespace>
```

---

## 7. Get External IP

```bash
kubectl get svc -n <app-namespace>
```

---

## 8. GitHub Actions CI/CD Template

Create `.github/workflows/deploy.yaml`:

```yaml
name: Deploy to AKS

on:
  push:
    branches: [main]

env:
  ACR_NAME: <acr-name>
  RESOURCE_GROUP: <rg-name>
  AKS_CLUSTER: <aks-cluster-name>
  IMAGE_NAME: <app-name>

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Build and push image
        run: |
          az acr build \
            --registry ${{ env.ACR_NAME }} \
            --image ${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --file ./Dockerfile \
            .

      - name: Get AKS credentials
        run: |
          az aks get-credentials \
            --resource-group ${{ env.RESOURCE_GROUP }} \
            --name ${{ env.AKS_CLUSTER }}

      - name: Deploy to AKS
        run: |
          kubectl set image deployment/${{ env.IMAGE_NAME }} \
            ${{ env.IMAGE_NAME }}=${{ env.ACR_NAME }}.azurecr.io/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace default

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/${{ env.IMAGE_NAME }} --timeout=300s
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `kubectl get pods` | List pods |
| `kubectl get svc` | List services |
| `kubectl logs <pod>` | View logs |
| `kubectl describe pod <pod>` | Debug pod issues |
| `kubectl delete -f file.yaml` | Remove resource |
| `kubectl rollout restart deployment/<name>` | Restart deployment |

---

## Common Issues

### ImagePullBackOff
- ACR credentials not configured
- Run: `kubectl get secret acr-secret`

### CrashLoopBackOff
- Check logs: `kubectl logs <pod>`
- Usually missing env vars or wrong config

### Pending External IP
- Wait 1-2 minutes for Azure to provision LoadBalancer
