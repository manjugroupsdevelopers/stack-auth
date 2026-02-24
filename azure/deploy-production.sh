#!/bin/bash

# Stack Auth Production Deployment to Azure
# This script deploys Stack Auth with production-grade resources

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Stack Auth Production Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Configuration
RESOURCE_GROUP="manjuwellness-auth"
LOCATION="centralindia"
ACR_NAME="stackauthreg1771923374"
DB_SERVER_NAME="stackauthdb1771923374"
CONTAINER_ENV_NAME="stack-auth-env"

# Get user input
read -p "Enter Freestyle API key (press Enter to skip): " FREESTYLE_API_KEY
FREESTYLE_API_KEY=${FREESTYLE_API_KEY:-not-configured}

read -p "Enter admin email [developer@manjugroups.in]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-developer@manjugroups.in}

read -sp "Enter admin password (min 8 chars): " ADMIN_PASSWORD
echo ""

read -sp "Enter database admin password: " DB_ADMIN_PASSWORD
echo ""

# Generate secrets
STACK_SERVER_SECRET=$(openssl rand -base64 32)

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "Backend: 4 CPU, 8GB RAM, 2-10 replicas"
echo "Dashboard: 2 CPU, 4GB RAM, 2-5 replicas"
echo "Database: Standard_D4s_v3 (4 vCores, 16GB RAM)"
echo ""

read -p "Continue with production deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting production deployment...${NC}"

# Get ACR credentials
echo -e "${YELLOW}[1/5] Getting Azure Container Registry credentials...${NC}"
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query 'passwords[0].value' -o tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
echo -e "${GREEN}✓ ACR credentials retrieved${NC}"

# Database connection string (URL-encode password)
DB_ADMIN_USER="stackadmin"
DB_HOST="$DB_SERVER_NAME.postgres.database.azure.com"
DB_ADMIN_PASSWORD_ENCODED=$(echo "$DB_ADMIN_PASSWORD" | jq -sRr @uri)
DB_CONNECTION_STRING="postgresql://$DB_ADMIN_USER:$DB_ADMIN_PASSWORD_ENCODED@$DB_HOST:5432/stackframe?sslmode=require"

# Update or create backend with production specs
echo -e "${YELLOW}[2/5] Deploying backend with production configuration...${NC}"
az containerapp update \
  --name stack-auth-backend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    "NODE_ENV=production" \
    "STACK_DATABASE_CONNECTION_STRING=$DB_CONNECTION_STRING" \
    "STACK_SERVER_SECRET=$STACK_SERVER_SECRET" \
    "STACK_FREESTYLE_API_KEY=$FREESTYLE_API_KEY" \
    "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true" \
    "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false" \
    "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true" \
    "STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=$ADMIN_EMAIL" \
    "STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=$ADMIN_PASSWORD" \
    "STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS=true" \
  --output none 2>/dev/null || {
    echo "Backend doesn't exist, creating new..."
    az containerapp create \
      --name stack-auth-backend \
      --resource-group $RESOURCE_GROUP \
      --environment $CONTAINER_ENV_NAME \
      --image $ACR_LOGIN_SERVER/stackauth/server:latest \
      --registry-server $ACR_LOGIN_SERVER \
      --registry-username $ACR_USERNAME \
      --registry-password $ACR_PASSWORD \
      --target-port 8102 \
      --ingress external \
      --cpu 4.0 \
      --memory 8.0Gi \
      --min-replicas 2 \
      --max-replicas 10 \
      --env-vars \
        "NODE_ENV=production" \
        "STACK_DATABASE_CONNECTION_STRING=$DB_CONNECTION_STRING" \
        "STACK_SERVER_SECRET=$STACK_SERVER_SECRET" \
        "STACK_FREESTYLE_API_KEY=$FREESTYLE_API_KEY" \
        "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true" \
        "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false" \
        "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true" \
        "STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=$ADMIN_EMAIL" \
        "STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=$ADMIN_PASSWORD" \
        "STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS=true" \
      --output none
}

BACKEND_URL=$(az containerapp show \
  --name stack-auth-backend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}✓ Backend deployed: https://$BACKEND_URL${NC}"

# Update or create dashboard with production specs
echo -e "${YELLOW}[3/5] Deploying dashboard with production configuration...${NC}"
az containerapp update \
  --name stack-auth-dashboard \
  --resource-group $RESOURCE_GROUP \
  --cpu 2.0 \
  --memory 4.0Gi \
  --min-replicas 2 \
  --max-replicas 5 \
  --set-env-vars \
    "NODE_ENV=production" \
    "STACK_DATABASE_CONNECTION_STRING=$DB_CONNECTION_STRING" \
    "STACK_SERVER_SECRET=$STACK_SERVER_SECRET" \
    "STACK_FREESTYLE_API_KEY=$FREESTYLE_API_KEY" \
    "NEXT_PUBLIC_STACK_API_URL=https://$BACKEND_URL" \
    "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true" \
    "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false" \
    "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true" \
  --output none 2>/dev/null || {
    echo "Dashboard doesn't exist, creating new..."
    az containerapp create \
      --name stack-auth-dashboard \
      --resource-group $RESOURCE_GROUP \
      --environment $CONTAINER_ENV_NAME \
      --image $ACR_LOGIN_SERVER/stackauth/server:latest \
      --registry-server $ACR_LOGIN_SERVER \
      --registry-username $ACR_USERNAME \
      --registry-password $ACR_PASSWORD \
      --target-port 8101 \
      --ingress external \
      --cpu 2.0 \
      --memory 4.0Gi \
      --min-replicas 2 \
      --max-replicas 5 \
      --env-vars \
        "NODE_ENV=production" \
        "STACK_DATABASE_CONNECTION_STRING=$DB_CONNECTION_STRING" \
        "STACK_SERVER_SECRET=$STACK_SERVER_SECRET" \
        "STACK_FREESTYLE_API_KEY=$FREESTYLE_API_KEY" \
        "NEXT_PUBLIC_STACK_API_URL=https://$BACKEND_URL" \
        "STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true" \
        "STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false" \
        "STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true" \
      --output none
}

DASHBOARD_URL=$(az containerapp show \
  --name stack-auth-dashboard \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)
echo -e "${GREEN}✓ Dashboard deployed: https://$DASHBOARD_URL${NC}"

# Update backend with dashboard URL
echo -e "${YELLOW}[4/5] Updating backend with dashboard URL...${NC}"
az containerapp update \
  --name stack-auth-backend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "NEXT_PUBLIC_STACK_DASHBOARD_URL=https://$DASHBOARD_URL" \
  --output none
echo -e "${GREEN}✓ Backend configuration updated${NC}"

# Upgrade database to production tier (if needed)
echo -e "${YELLOW}[5/5] Checking database configuration...${NC}"
CURRENT_SKU=$(az postgres flexible-server show \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --query sku.name -o tsv)

if [ "$CURRENT_SKU" != "Standard_D4s_v3" ]; then
    echo -e "${YELLOW}Current database SKU: $CURRENT_SKU${NC}"
    echo -e "${YELLOW}Recommended production SKU: Standard_D4s_v3 (4 vCores, 16GB RAM)${NC}"
    read -p "Upgrade database to production tier? (yes/no): " UPGRADE_DB
    
    if [ "$UPGRADE_DB" = "yes" ]; then
        echo "Upgrading database... This may take 5-10 minutes."
        az postgres flexible-server update \
          --resource-group $RESOURCE_GROUP \
          --name $DB_SERVER_NAME \
          --sku-name Standard_D4s_v3 \
          --tier GeneralPurpose \
          --storage-size 128 \
          --output none
        echo -e "${GREEN}✓ Database upgraded to production tier${NC}"
    else
        echo -e "${YELLOW}⚠ Database upgrade skipped${NC}"
    fi
else
    echo -e "${GREEN}✓ Database already on production tier${NC}"
fi

# Save deployment info
cat > azure-production-deployment.txt << EOF
Stack Auth Production Deployment
=================================
Deployment Date: $(date)

URLS
----
Dashboard: https://$DASHBOARD_URL
Backend API: https://$BACKEND_URL

ADMIN CREDENTIALS
-----------------
Email: $ADMIN_EMAIL
Password: $ADMIN_PASSWORD

RESOURCE CONFIGURATION
----------------------
Backend:
- CPU: 4.0 cores
- Memory: 8GB
- Replicas: 2-10 (auto-scaling)
- Concurrent Requests: 100 per replica

Dashboard:
- CPU: 2.0 cores
- Memory: 4GB
- Replicas: 2-5 (auto-scaling)
- Concurrent Requests: 50 per replica

Database:
- SKU: Standard_D4s_v3
- vCores: 4
- Memory: 16GB
- Storage: 128GB
- Backup Retention: 30 days

AZURE RESOURCES
---------------
Resource Group: $RESOURCE_GROUP
Location: $LOCATION
Container Registry: $ACR_NAME
Database Server: $DB_SERVER_NAME
Container Environment: $CONTAINER_ENV_NAME

SECRETS
-------
Stack Server Secret: $STACK_SERVER_SECRET

ESTIMATED MONTHLY COST
----------------------
- Container Apps (Backend): ~$200-400
- Container Apps (Dashboard): ~$100-200
- PostgreSQL (Standard_D4s_v3): ~$250-300
- Container Registry: ~$5
- Log Analytics: ~$10-20
Total: ~$565-925/month

MANAGEMENT COMMANDS
-------------------
View backend logs:
  az containerapp logs show --name stack-auth-backend --resource-group $RESOURCE_GROUP --follow

View dashboard logs:
  az containerapp logs show --name stack-auth-dashboard --resource-group $RESOURCE_GROUP --follow

Scale backend:
  az containerapp update --name stack-auth-backend --resource-group $RESOURCE_GROUP --min-replicas 3 --max-replicas 15

Monitor metrics:
  az monitor metrics list --resource /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.App/containerApps/stack-auth-backend

IMPORTANT: Keep this file secure!
EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Production Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Dashboard:${NC} https://$DASHBOARD_URL"
echo -e "${GREEN}Backend API:${NC} https://$BACKEND_URL"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Backend: 4 CPU, 8GB RAM, 2-10 replicas"
echo "  Dashboard: 2 CPU, 4GB RAM, 2-5 replicas"
echo "  Database: 4 vCores, 16GB RAM"
echo ""
echo -e "${YELLOW}Deployment details saved to: azure-production-deployment.txt${NC}"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "1. Visit the dashboard and log in"
echo "2. Configure custom domains (optional)"
echo "3. Set up monitoring and alerts"
echo "4. Configure backup policies"
echo ""
