#!/bin/bash

# Stack Auth Production Startup Script
# This script starts Stack Auth using Docker Compose

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 Starting Stack Auth in Production Mode"
echo "=========================================="
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ Error: .env.production file not found!${NC}"
    echo "Please create .env.production with your configuration."
    exit 1
fi

# Check for required environment variables
if grep -q "CHANGE_THIS_TO_A_SECURE_RANDOM_STRING" .env.production; then
    echo -e "${YELLOW}⚠️  Warning: STACK_SERVER_SECRET is not set!${NC}"
    echo "   Generate one with: openssl rand -base64 32"
    echo ""
fi

if grep -q "YOUR_FREESTYLE_API_KEY_HERE" .env.production; then
    echo -e "${YELLOW}⚠️  Warning: STACK_FREESTYLE_API_KEY is not set!${NC}"
    echo "   Email functionality will not work."
    echo "   Get your API key from: https://freestyle.sh"
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running!${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

# Stop existing containers
echo "🧹 Stopping existing containers..."
docker-compose -f docker-compose.production.yml down 2>/dev/null || true

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check PostgreSQL
echo -n "   Checking PostgreSQL... "
for i in {1..30}; do
    if docker exec stack-postgres-prod pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗${NC}"
        echo -e "${RED}PostgreSQL failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Wait for Stack Auth
echo -n "   Checking Stack Auth... "
sleep 10
for i in {1..60}; do
    if curl -s http://localhost:8102/api/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${YELLOW}⚠${NC}"
        echo -e "${YELLOW}   Stack Auth may still be starting. Check logs with: docker logs stack-auth-server${NC}"
        break
    fi
    sleep 1
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
echo "   View logs:        docker-compose -f docker-compose.production.yml logs -f"
echo "   Stop services:    docker-compose -f docker-compose.production.yml down"
echo "   Restart:          docker-compose -f docker-compose.production.yml restart"
echo ""
echo -e "${YELLOW}⚠️  Remember to update production secrets in .env.production!${NC}"
echo ""
