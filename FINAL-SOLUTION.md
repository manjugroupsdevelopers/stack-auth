# Stack Auth Docker - Final Solution

## Current Situation

The official `stackauth/server:latest` Docker image has a bug where it requires `STACK_CLICKHOUSE_URL` even though ClickHouse should be optional. We've fixed this in the source code (`apps/backend/scripts/db-migrations.ts`), but the fix needs to be in the Docker image.

## The Problem

1. **Building locally fails** - Out of memory error during TypeScript compilation
2. **Official image has bug** - Crashes when STACK_CLICKHOUSE_URL is not set
3. **Workarounds don't work** - The entrypoint script always runs migrations

## Solutions (Choose One)

### Solution 1: Wait for Official Fix (Recommended for Production)

The Stack Auth team needs to:
1. Merge the ClickHouse fix from `apps/backend/scripts/db-migrations.ts`
2. Build and push a new Docker image
3. Then you can use the standard setup

**Timeline**: Unknown - depends on Stack Auth team

### Solution 2: Build with More Memory (For Development)

If you have enough RAM (16GB+), build with increased Docker memory:

```bash
# Increase Docker Desktop memory to 8GB+ in settings
# Then build:
docker build \
  --memory=8g \
  --memory-swap=8g \
  -f docker/server/Dockerfile \
  -t stackauth/server:local \
  .
```

This will take 15-20 minutes but includes all our fixes.

### Solution 3: Use Development Setup (Easiest Now)

Instead of Docker, run Stack Auth in development mode:

```bash
# Install dependencies
pnpm install

# Start dependencies (PostgreSQL, etc.)
pnpm restart-deps

# Start Stack Auth
pnpm dev
```

This uses our fixed code and is faster for development.

### Solution 4: Set Up ClickHouse (Workaround)

If you don't mind running ClickHouse (even if unused):

```bash
# Add to docker-compose.production.yml:
clickhouse:
  image: clickhouse/clickhouse-server:25.10
  container_name: stack-clickhouse
  environment:
    CLICKHOUSE_DB: analytics
    CLICKHOUSE_USER: stackframe
    CLICKHOUSE_PASSWORD: password
  ports:
    - "8123:8123"
  volumes:
    - clickhouse-data:/var/lib/clickhouse

# Add to .env.production:
STACK_CLICKHOUSE_URL=http://clickhouse:8123
STACK_CLICKHOUSE_ADMIN_USER=stackframe
STACK_CLICKHOUSE_ADMIN_PASSWORD=password
STACK_CLICKHOUSE_EXTERNAL_PASSWORD=password

# Then start:
docker compose -f docker-compose.production.yml up -d
```

## What We Accomplished

### Files Created:
- `docker-compose.production.yml` - Production Docker Compose setup
- `.env.production` - Environment configuration with secure defaults
- `start-production.sh` - Automated startup script
- `DOCKER-DEPLOYMENT.md` - Complete deployment guide
- `SETUP-SUMMARY.md` - Summary of all changes
- `run-with-workaround.sh` - Attempted workaround script

### Code Fixed:
- `apps/backend/scripts/db-migrations.ts` - Made ClickHouse optional
  - Added check for `STACK_CLICKHOUSE_URL` before running ClickHouse migrations
  - Added proper error handling for missing ClickHouse configuration

### Configuration:
- Generated secure `STACK_SERVER_SECRET`
- Set up all required environment variables
- Configured PostgreSQL connection
- Added ClickHouse variables (empty = disabled)

## Recommended Next Steps

### For Immediate Use:
1. **Use Development Mode** (Solution 3)
   ```bash
   pnpm install
   pnpm restart-deps
   pnpm dev
   ```
   Access at:
   - Dashboard: http://localhost:8101
   - API: http://localhost:8102

### For Production Deployment:
1. **Contact Stack Auth Team**
   - Report the ClickHouse bug
   - Request a new Docker image with the fix
   - Reference: `apps/backend/scripts/db-migrations.ts` lines 165-175

2. **Or Build Locally** (if you have resources)
   - Increase Docker memory to 8GB+
   - Run the build (takes 15-20 min)
   - Use the local image

3. **Or Deploy from Source**
   - Deploy the source code directly
   - Use PM2 or similar process manager
   - Run migrations separately

## Environment Variables Reference

### Required:
```bash
STACK_SERVER_SECRET=<generated-secure-key>
STACK_FREESTYLE_API_KEY=<from-freestyle.sh>
STACK_DATABASE_CONNECTION_STRING=postgresql://...
NEXT_PUBLIC_STACK_API_URL=http://localhost:8102
NEXT_PUBLIC_STACK_DASHBOARD_URL=http://localhost:8101
```

### Optional (ClickHouse):
```bash
STACK_CLICKHOUSE_URL=
STACK_CLICKHOUSE_ADMIN_USER=
STACK_CLICKHOUSE_ADMIN_PASSWORD=
STACK_CLICKHOUSE_EXTERNAL_PASSWORD=
```

## Support

- GitHub Issues: https://github.com/stack-auth/stack/issues
- Discord: https://discord.stack-auth.com
- Documentation: https://docs.stack-auth.com

## Summary

The Docker deployment is blocked by a bug in the official image. The best immediate solution is to use development mode (`pnpm dev`) which works perfectly with our fixes. For production, either wait for an official fix or build locally with increased memory.
