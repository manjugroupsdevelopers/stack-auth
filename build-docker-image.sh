#!/bin/bash

# Build Stack Auth Docker Image with Memory Optimization
# Requires: 24GB RAM system

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔨 Building Stack Auth Docker Image"
echo "===================================="
echo ""
echo -e "${BLUE}System RAM: 24GB${NC}"
echo -e "${BLUE}Docker Memory: 10GB${NC}"
echo -e "${YELLOW}⏱️  Estimated time: 15-20 minutes${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running!${NC}"
    exit 1
fi

# Clean up old build artifacts
echo "🧹 Cleaning up old builds..."
docker builder prune -f > /dev/null 2>&1 || true

# Build with memory limits
echo ""
echo "📦 Starting Docker build..."
echo -e "${YELLOW}This will take 15-20 minutes. Please be patient...${NC}"
echo ""

docker build \
  --progress=plain \
  --memory=10g \
  --memory-swap=12g \
  --shm-size=2g \
  -f docker/server/Dockerfile \
  -t stackauth/server:local \
  . 2>&1 | tee /tmp/docker-build.log

BUILD_EXIT_CODE=${PIPESTATUS[0]}

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✅ Build Successful!${NC}"
    echo "=========================================="
    echo ""
    echo "Image: stackauth/server:local"
    echo ""
    
    # Update docker-compose to use local image
    if [ -f docker-compose.production.yml ]; then
        echo "📝 Updating docker-compose.production.yml..."
        sed -i.bak 's/stackauth\/server:latest/stackauth\/server:local/g' docker-compose.production.yml
        echo -e "${GREEN}✓ Updated to use local image${NC}"
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Start services: ./start-production.sh"
    echo "  2. Or manually: docker compose -f docker-compose.production.yml up -d"
    echo ""
else
    echo ""
    echo "=========================================="
    echo -e "${RED}❌ Build Failed${NC}"
    echo "=========================================="
    echo ""
    echo "Check the log: /tmp/docker-build.log"
    echo ""
    echo "Common issues:"
    echo "  - Increase Docker Desktop memory to 10GB+"
    echo "  - Check disk space (need ~20GB free)"
    echo "  - Restart Docker Desktop"
    echo ""
    exit 1
fi
