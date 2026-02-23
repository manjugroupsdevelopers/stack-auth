#!/bin/bash

# Stack Auth Production Quick Start
# Simplified script for getting Stack Auth running quickly

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🚀 Stack Auth Production Quick Start"
echo "====================================="
echo ""

# Stop all existing containers
echo "🧹 Cleaning up..."
docker stop $(docker ps -q) 2>/dev/null || true
lsof -ti :8101 :8102 | xargs -r kill -9 2>/dev/null || true
sleep 2

# Remove old containers
docker rm stack-postgres-prod stack-auth-server 2>/dev/null || true

# Start fresh Postgres
echo "🐘 Starting PostgreSQL..."
docker run -d \
    --name stack-postgres-prod \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=stackframe \
    -p 5432:5432 \
    postgres:latest

# Wait for Postgres
echo "⏳ Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker exec stack-postgres-prod pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL ready${NC}"
        break
    fi
    sleep 1
done

# Start Stack Auth (without Clickhouse requirement)
echo "🚀 Starting Stack Auth..."
docker run -d \
    --name stack-auth-server \
    -e STACK_SERVER_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_AT_LEAST_32_CHARS \
    -e STACK_DATABASE_CONNECTION_STRING=postgresql://postgres:password@host.docker.internal:5432/stackframe \
    -e STACK_FREESTYLE_API_KEY=YOUR_FREESTYLE_API_KEY_HERE \
    -e NEXT_PUBLIC_STACK_API_URL=http://localhost:8102 \
    -e NEXT_PUBLIC_STACK_DASHBOARD_URL=http://localhost:8101 \
    -e NODE_ENV=production \
    -p 8101:8101 \
    -p 8102:8102 \
    stackauth/server:latest

echo "⏳ Waiting for Stack Auth to start..."
sleep 15

# Check status
if docker ps | grep -q stack-auth-server; then
    echo ""
    echo "====================================="
    echo -e "${GREEN}✅ Stack Auth is Running!${NC}"
    echo "====================================="
    echo ""
    echo -e "${BLUE}Dashboard: http://localhost:8101${NC}"
    echo -e "${BLUE}API:       http://localhost:8102${NC}"
    echo ""
    echo "⚠️  IMPORTANT: Update these values in production:"
    echo "   - STACK_SERVER_SECRET (use: openssl rand -base64 32)"
    echo "   - STACK_FREESTYLE_API_KEY (get from https://freestyle.sh)"
    echo ""
    echo "📝 View logs: docker logs -f stack-auth-server"
    echo "🛑 Stop: docker stop stack-auth-server stack-postgres-prod"
else
    echo -e "${YELLOW}⚠️  Stack Auth may still be starting...${NC}"
    echo "Check logs: docker logs stack-auth-server"
fi
