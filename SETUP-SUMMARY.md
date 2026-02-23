# Stack Auth Docker Setup Summary

## What We Fixed

### 1. ClickHouse Optional Bug
- **Problem**: The migration script was trying to run ClickHouse migrations even when ClickHouse wasn't configured
- **Fix**: Modified `apps/backend/scripts/db-migrations.ts` to check if `STACK_CLICKHOUSE_URL` is set before running ClickHouse migrations
- **Status**: ✅ Fixed in source code, but needs to be built into Docker image

### 2. Created Docker Deployment Files

#### `docker-compose.production.yml`
- PostgreSQL database service
- Stack Auth server (backend + dashboard)
- Proper health checks and dependencies
- Volume persistence for database

#### `.env.production`
- All required environment variables
- Secure server secret generated
- ClickHouse variables added (empty = disabled)
- Clear documentation for each setting

#### `start-production.sh`
- Automated startup script
- Health checks for all services
- Clear status messages
- Helpful commands

#### `DOCKER-DEPLOYMENT.md`
- Complete deployment guide
- Troubleshooting section
- Production best practices

## Current Status

The Docker setup is ready, but the existing `stackauth/server:latest` image has the ClickHouse bug. You have two options:

### Option 1: Build Locally (Recommended for Development)

This will take 10-15 minutes but includes all our fixes:

```bash
# Build with our fixes
docker build -f docker/server/Dockerfile -t stackauth/server:local .

# Update docker-compose.yml to use local image
# Change: image: stackauth/server:latest
# To:     image: stackauth/server:local

# Start services
docker compose -f docker-compose.production.yml up -d
```

### Option 2: Wait for Official Fix

The Stack Auth team will need to:
1. Merge the ClickHouse fix
2. Build and push a new Docker image
3. Then you can use `stackauth/server:latest`

## Quick Start (After Building)

```bash
# Start everything
./start-production.sh

# Or manually
docker compose -f docker-compose.production.yml up -d

# View logs
docker logs -f stack-auth-server

# Stop
docker compose -f docker-compose.production.yml down
```

## Access Points

- **Dashboard**: http://localhost:8101
- **API**: http://localhost:8102
- **PostgreSQL**: localhost:5432

## Environment Variables Status

✅ `STACK_SERVER_SECRET` - Generated securely
⚠️  `STACK_FREESTYLE_API_KEY` - Needs your API key from https://freestyle.sh
✅ `STACK_DATABASE_CONNECTION_STRING` - Configured for Docker
✅ `STACK_CLICKHOUSE_URL` - Set to empty (disabled)
✅ URLs configured for localhost

## Next Steps

1. **Get Freestyle API Key** (required for emails):
   ```bash
   # Visit https://freestyle.sh and sign up
   # Update .env.production with your key
   ```

2. **Build the Docker image**:
   ```bash
   docker build -f docker/server/Dockerfile -t stackauth/server:local .
   ```

3. **Update docker-compose.production.yml**:
   ```yaml
   stack-auth:
     image: stackauth/server:local  # Change from :latest to :local
   ```

4. **Start services**:
   ```bash
   ./start-production.sh
   ```

## Files Created/Modified

### Created:
- `docker-compose.production.yml` - Docker Compose configuration
- `start-production.sh` - Startup script
- `DOCKER-DEPLOYMENT.md` - Deployment guide
- `build-and-run.sh` - Build helper script
- `SETUP-SUMMARY.md` - This file

### Modified:
- `apps/backend/scripts/db-migrations.ts` - ClickHouse optional fix
- `.env.production` - Updated with secure defaults

## Troubleshooting

### Container keeps restarting
```bash
# Check logs
docker logs stack-auth-server

# Common issue: ClickHouse error
# Solution: Build image with our fix
```

### Port conflicts
```bash
# Check what's using the ports
lsof -i :8101
lsof -i :8102
lsof -i :5432

# Kill processes or change ports in docker-compose.yml
```

### Database connection errors
```bash
# Verify PostgreSQL is running
docker exec stack-postgres-prod pg_isready -U postgres

# Check connection string in .env.production
```

## Production Checklist

Before deploying to production:

- [ ] Generate new `STACK_SERVER_SECRET` (openssl rand -base64 48)
- [ ] Get `STACK_FREESTYLE_API_KEY` from freestyle.sh
- [ ] Use external PostgreSQL (recommended)
- [ ] Set up HTTPS with reverse proxy
- [ ] Configure backups
- [ ] Set up monitoring
- [ ] Update URLs to production domains
- [ ] Review security settings

## Support

- Documentation: https://docs.stack-auth.com
- GitHub: https://github.com/stack-auth/stack
- Discord: https://discord.stack-auth.com
