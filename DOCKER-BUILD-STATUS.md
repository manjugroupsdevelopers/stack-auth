# Docker Build Status - Stack Auth

## Current Build Attempt

🔨 **Build #2**: Running with increased memory settings

### Configuration
- **Docker Memory**: 12GB (increased from 10GB)
- **Node.js Heap**: 8GB (NEW - fixes the worker memory issue)
- **Shared Memory**: 4GB
- **System RAM**: 24GB

### What Changed
The previous build failed because Node.js workers have their own memory limits separate from Docker's memory allocation. We've now set:
```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=8192"
```

This gives Node.js 8GB heap space for TypeScript compilation.

## Monitor Progress

```bash
# Quick check
tail -20 /tmp/docker-build-high-mem.log

# Watch live
tail -f /tmp/docker-build-high-mem.log

# Check if still running
ps aux | grep docker | grep build
```

## Expected Timeline

- **0-5 min**: Base images and dependencies
- **5-10 min**: Installing packages
- **10-20 min**: TypeScript compilation (should work now with 8GB heap)
- **20-22 min**: Final image creation

## Why This Should Work

### Previous Issue
```
Error [ERR_WORKER_OUT_OF_MEMORY]: Worker terminated due to reaching memory limit
```

This happened because:
1. Docker had 10GB memory ✅
2. But Node.js workers defaulted to ~2GB heap ❌
3. TypeScript compilation needs more memory

### Current Fix
1. Docker has 12GB memory ✅
2. Node.js has 8GB heap (`NODE_OPTIONS`) ✅
3. Should handle TypeScript compilation ✅

## If This Build Also Fails

### Option 1: Development Mode (Recommended)
Skip Docker entirely and run locally:

```bash
# Install dependencies
pnpm install

# Start PostgreSQL and other services
pnpm restart-deps

# Start Stack Auth
pnpm dev
```

**Advantages:**
- ✅ Works immediately
- ✅ Uses our ClickHouse fix
- ✅ Faster development cycle
- ✅ No Docker memory issues

**Access:**
- Dashboard: http://localhost:8101
- API: http://localhost:8102

### Option 2: Multi-Stage Build
Build packages separately to reduce memory pressure:

```bash
# Build each package individually
cd packages/stack-shared
pnpm build

cd ../stack-sc
pnpm build

# Then build Docker image
docker build -f docker/server/Dockerfile -t stackauth/server:local .
```

### Option 3: Use Official Image + ClickHouse
Add ClickHouse to work around the bug:

```yaml
# In docker-compose.production.yml
clickhouse:
  image: clickhouse/clickhouse-server:25.10
  environment:
    CLICKHOUSE_USER: stackframe
    CLICKHOUSE_PASSWORD: password
  ports:
    - "8123:8123"
```

Then set in `.env.production`:
```bash
STACK_CLICKHOUSE_URL=http://clickhouse:8123
STACK_CLICKHOUSE_ADMIN_PASSWORD=password
```

## Build Logs

- **Current build**: `/tmp/docker-build-high-mem.log`
- **Previous build**: `/tmp/docker-build.log`

## Next Steps After Success

1. ✅ Image built: `stackauth/server:local`
2. ✅ docker-compose updated automatically
3. 🚀 Run: `./start-production.sh`
4. 🌐 Access: http://localhost:8101

## Troubleshooting

### Build Still Out of Memory
```bash
# Check Docker Desktop settings
# Increase to 16GB if possible
# Settings → Resources → Memory → 16GB
```

### Build Hangs
```bash
# Check if it's actually building
docker stats

# If CPU is active, it's working
# TypeScript compilation is CPU-intensive
```

### Want to Cancel
```bash
# Stop the build
docker ps -a | grep build
docker stop <container-id>

# Clean up
docker system prune -a
```

## Recommendation

Given the memory issues with Docker builds, I strongly recommend using **development mode** for now:

```bash
pnpm install
pnpm restart-deps  
pnpm dev
```

This:
- ✅ Works immediately (no 20-minute build)
- ✅ Includes all our fixes
- ✅ Perfect for development and testing
- ✅ Can deploy to production later using the source code

You can always build Docker later when you need it for production deployment.

---

**Status**: Build in progress with 8GB Node.js heap...
**Check**: `tail -f /tmp/docker-build-high-mem.log`
