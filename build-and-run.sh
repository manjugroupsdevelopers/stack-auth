#!/bin/bash

# Build Stack Auth with ClickHouse fix and run

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔨 Building Stack Auth Docker Image"
echo "===================================="
echo ""
echo -e "${YELLOW}⚠️  This will take 10-15 minutes...${NC}"
echo ""

# Stop existing containers
docker compose -f docker-compose.production.yml down 2>/dev/null || true

# Build the image
echo "📦 Building image..."
docker build \
  --progress=plain \
  -f docker/server/Dockerfile \
  -t stackauth/server:local \
  .

# Update docker-compose to use local image
sed -i.bak 's/stackauth\/server:latest/stackauth\/server:local/g' docker-compose.production.yml

# Start services
echo ""
echo "🚀 Starting services..."
docker compose -f docker-compose.production.yml up -d

echo ""
echo "⏳ Waiting for services..."
sleep 20

# Check status
docker compose -f docker-compose.production.yml ps

echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "📝 View logs: docker logs -f stack-auth-server"
echo "🌐 Dashboard: http://localhost:8101"
echo "🔌 API: http://localhost:8102"
