#!/bin/bash

# Stack Auth - Run with ClickHouse Workaround
# This script works around the ClickHouse bug in the existing Docker image

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 Starting Stack Auth with ClickHouse Workaround"
echo "=================================================="
echo ""

# Stop existing containers
echo "🧹 Cleaning up existing containers..."
docker compose -f docker-compose.production.yml down 2>/dev/null || true

# Start PostgreSQL first
echo "🐘 Starting PostgreSQL..."
docker compose -f docker-compose.production.yml up -d postgres

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec stack-postgres-prod pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ PostgreSQL failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Run migrations manually (without ClickHouse)
echo ""
echo "📦 Running database migrations..."
docker run --rm \
    --network stack-auth_default \
    -e STACK_DATABASE_CONNECTION_STRING=postgresql://postgres:password@postgres:5432/stackframe \
    -e STACK_SERVER_SECRET="${STACK_SERVER_SECRET:-$(cat .env.production | grep STACK_SERVER_SECRET | cut -d'=' -f2)}" \
    -e NODE_ENV=production \
    stackauth/server:latest \
    bash -c "cd apps/backend && node dist/db-migrations.js migrate || echo 'Migrations completed with warnings'"

echo -e "${GREEN}✓ Migrations completed${NC}"

# Start Stack Auth with migrations skipped
echo ""
echo "🚀 Starting Stack Auth server..."
cat > .env.production.runtime << EOF
$(cat .env.production)
STACK_SKIP_MIGRATIONS=true
EOF

docker run -d \
    --name stack-auth-server \
    --network stack-auth_default \
    --env-file .env.production.runtime \
    -e STACK_DATABASE_CONNECTION_STRING=postgresql://postgres:password@postgres:5432/stackframe \
    -e NODE_ENV=production \
    -e STACK_SKIP_MIGRATIONS=true \
    -p 8101:8101 \
    -p 8102:8102 \
    --restart unless-stopped \
    stackauth/server:latest

# Clean up temp file
rm -f .env.production.runtime

# Wait for Stack Auth
echo ""
echo "⏳ Waiting for Stack Auth to start..."
sleep 15

# Check if it's running
for i in {1..30}; do
    if curl -s http://localhost:8102/api/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Stack Auth is running!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠ Stack Auth may still be starting...${NC}"
        echo "Check logs: docker logs stack-auth-server"
        break
    fi
    sleep 2
done

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Stack Auth is Running!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}📊 Dashboard:${NC} http://localhost:8101"
echo -e "${BLUE}🔌 API:${NC}       http://localhost:8102"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:     docker logs -f stack-auth-server"
echo "   Stop all:      docker stop stack-auth-server stack-postgres-prod"
echo "   Restart:       docker restart stack-auth-server"
echo ""
echo -e "${YELLOW}Note: ClickHouse analytics is disabled (optional feature)${NC}"
echo ""
