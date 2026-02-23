#!/bin/bash

# Build Stack Auth with Maximum Memory Settings
# For systems with 24GB RAM

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔨 Building Stack Auth with High Memory Settings"
echo "================================================="
echo ""
echo -e "${BLUE}System RAM: 24GB${NC}"
echo -e "${BLUE}Docker Memory: 12GB${NC}"
echo -e "${BLUE}Node.js Heap: 8GB${NC}"
echo -e "${YELLOW}⏱️  Estimated time: 15-20 minutes${NC}"
echo ""

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    exit 1
fi

# Clean up
echo "🧹 Cleaning up..."
docker builder prune -f > /dev/null 2>&1 || true
docker system prune -f > /dev/null 2>&1 || true

echo ""
echo "📦 Starting build with increased memory limits..."
echo -e "${YELLOW}Building... This takes 15-20 minutes.${NC}"
echo ""

# Build with maximum memory
docker build \
  --progress=plain \
  --memory=12g \
  --memory-swap=14g \
  --shm-size=4g \
  --build-arg BUILDKIT_STEP_LOG_MAX_SIZE=50000000 \
  -f docker/server/Dockerfile \
  -t stackauth/server:local \
  . 2>&1 | tee /tmp/docker-build-high-mem.log

BUILD_EXIT_CODE=${PIPESTATUS[0]}

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✅ Build Successful!${NC}"
    echo "=========================================="
    echo ""
    echo "Image: stackauth/server:local"
    echo "Size: $(docker images stackauth/server:local --format '{{.Size}}')"
    echo ""
    
    # Update docker-compose
    if [ -f docker-compose.production.yml ]; then
        sed -i.bak 's/stackauth\/server:latest/stackauth\/server:local/g' docker-compose.production.yml
        echo -e "${GREEN}✓ Updated docker-compose.production.yml${NC}"
    fi
    
    echo ""
    echo "🚀 Ready to start!"
    echo ""
    echo "Run: ./start-production.sh"
    echo ""
else
    echo ""
    echo "=========================================="
    echo -e "${RED}❌ Build Failed${NC}"
    echo "=========================================="
    echo ""
    echo "Log: /tmp/docker-build-high-mem.log"
    echo ""
    echo "The build failed during TypeScript compilation."
    echo ""
    echo "Alternative: Use development mode instead"
    echo "  pnpm install"
    echo "  pnpm restart-deps"
    echo "  pnpm dev"
    echo ""
    exit 1
fi
