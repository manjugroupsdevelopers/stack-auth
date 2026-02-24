# Stack Auth Azure Deployment Plan

## Phase 1: Clean Up Azure Resources
- [x] Delete all resources in `manjuwellness-auth` resource group
- [x] Verify deletion complete

**Deleted:**
- ✅ stack-auth-backend (container app)
- ✅ stack-auth-dashboard (container app)
- ✅ stackauthdb1771923374 (PostgreSQL server)
- ✅ stackauthreg1771922978 (unused ACR)
- 🔄 stack-auth-env (managed environment - deleting in background)

**Remaining (will reuse):**
- stackauthreg1771923374 (Container Registry)

## Phase 2: Build Custom Docker Image Locally
- [x] Build image from local code
- [x] Push to Azure Container Registry

**Image Details:**
- Tag: `stackauthreg1771923374.azurecr.io/stackauth/server:v1`
- Size: ~856MB

## Phase 3: Push to Azure Container Registry
- [ ] Login to Azure ACR
- [ ] Tag and push custom image

## Phase 4: Deploy to Azure Container Apps
- [ ] Create/recreate database (PostgreSQL flexible server)
- [ ] Create Container Apps Environment
- [ ] Deploy backend container
- [ ] Deploy dashboard container
- [ ] Configure environment variables (URL-encode password!)
- [ ] Run migrations
- [ ] Verify deployment

## Phase 5: Create GitHub Actions Workflow (Optional)
- [ ] Create workflow to auto-build on push
- [ ] Configure secrets in GitHub

---

## Key Configuration Notes

### Database Password URL Encoding
- Character `@` in password must be encoded as `%40`
- Example: `Manju@2026` → `Manju%402026`
- Connection string: `postgresql://stackadmin:Manju%402026@host.postgres.database.azure.com:5432/stackframe?sslmode=require`

### Environment Variables Required
```
NODE_ENV=production
STACK_DATABASE_CONNECTION_STRING=<URL-encoded>
STACK_SERVER_SECRET=<generate with openssl rand -base64 32>
NEXT_PUBLIC_STACK_API_URL=https://<backend-fqdn>
NEXT_PUBLIC_STACK_DASHBOARD_URL=https://<dashboard-fqdn>
STACK_FREESTYLE_API_KEY=<from freestyle.sh>
STACK_SEED_INTERNAL_PROJECT_SIGN_UP_ENABLED=true
STACK_SEED_INTERNAL_PROJECT_ALLOW_LOCALHOST=false
STACK_SEED_INTERNAL_PROJECT_OTP_ENABLED=true
STACK_SEED_INTERNAL_PROJECT_USER_EMAIL=<admin-email>
STACK_SEED_INTERNAL_PROJECT_USER_PASSWORD=<admin-password>
STACK_SEED_INTERNAL_PROJECT_USER_INTERNAL_ACCESS=true
```

### Resource Specifications
| Resource | CPU | Memory | Replicas |
|----------|-----|--------|----------|
| Backend | 4.0 | 8Gi | 2-10 |
| Dashboard | 2.0 | 4Gi | 2-5 |
| Database | 4 vCores | 16GB | - |
