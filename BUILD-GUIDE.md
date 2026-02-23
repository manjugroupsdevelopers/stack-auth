# Stack Auth Docker Build Guide

## Build Status

🔨 **Build Started**: The Docker image is currently building with 10GB memory allocation.

⏱️ **Estimated Time**: 15-20 minutes

📊 **System**: 24GB RAM (10GB allocated to Docker)

## Monitor Build Progress

### Quick Check
```bash
./check-build-progress.sh
```

### Watch Live
```bash
tail -f /tmp/docker-build.log
```

### Check if Build is Running
```bash
docker ps -a | grep build
```

## Build Stages

The build goes through these stages:

1. **Base Image** (2-3 min)
   - Downloads Node.js base images
   - Sets up build environment

2. **Dependencies** (3-5 min)
   - Installs pnpm and turbo
   - Downloads npm packages

3. **Pruning** (1 min)
   - Generates SDKs
   - Prunes unnecessary files

4. **TypeScript Build** (8-12 min) ⚠️ Memory intensive
   - Compiles all TypeScript packages
   - This is where the previous build failed

5. **Final Image** (1-2 min)
   - Copies built files
   - Creates production image

## What to Expect

### Normal Output
You'll see lots of:
- Package installations
- TypeScript compilation messages
- "Build success" messages for each package

### Warning Signs
- "out of memory" errors
- Build hanging for >5 minutes on one step
- Docker daemon errors

## If Build Fails

### Out of Memory
```bash
# Increase Docker Desktop memory:
# Docker Desktop → Settings → Resources → Memory → 12GB
# Then rebuild:
./build-docker-image.sh
```

### Disk Space
```bash
# Check available space (need ~20GB):
df -h

# Clean up Docker:
docker system prune -a
```

### Docker Issues
```bash
# Restart Docker Desktop
# Then try again:
./build-docker-image.sh
```

## After Build Completes

### Verify Image
```bash
docker images | grep stackauth
# Should show: stackauth/server:local
```

### Start Services
```bash
./start-production.sh
```

Or manually:
```bash
docker compose -f docker-compose.production.yml up -d
```

### Access Application
- Dashboard: http://localhost:8101
- API: http://localhost:8102

## Build Includes

✅ ClickHouse optional fix
✅ All source code changes
✅ Production optimizations
✅ Both backend and dashboard

## Troubleshooting

### Build Stuck
```bash
# Check Docker resources:
docker stats

# If CPU/Memory maxed out, it's still building
# Be patient!
```

### Build Failed at TypeScript
```bash
# This is the memory-intensive part
# Increase Docker memory to 12GB and retry
```

### Can't Find Image After Build
```bash
# List all images:
docker images

# If stackauth/server:local exists, update docker-compose:
sed -i.bak 's/stackauth\/server:latest/stackauth\/server:local/g' docker-compose.production.yml
```

## Current Build Configuration

```dockerfile
Memory: 10GB
Memory Swap: 12GB
Shared Memory: 2GB
Progress: Plain (detailed output)
Output: /tmp/docker-build.log
```

## Next Steps After Successful Build

1. ✅ Image built: `stackauth/server:local`
2. ✅ docker-compose.yml updated automatically
3. 🚀 Run: `./start-production.sh`
4. 🌐 Access: http://localhost:8101

## Support

If you encounter issues:
1. Check `/tmp/docker-build.log` for details
2. Run `./check-build-progress.sh` for status
3. Ensure Docker has 10GB+ memory allocated
4. Verify 20GB+ free disk space

## Estimated Timeline

- **0-3 min**: Downloading base images
- **3-8 min**: Installing dependencies
- **8-18 min**: TypeScript compilation (memory intensive)
- **18-20 min**: Creating final image

Total: ~15-20 minutes

---

**Current Status**: Build in progress...
Check progress: `./check-build-progress.sh`
