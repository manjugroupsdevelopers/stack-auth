#!/bin/bash

# Stack Auth Production Setup Script with Complete Cleanup
# This script cleans up ALL Stack Auth processes and containers, then sets up production

set -e

echo "🚀 Stack Auth Production Setup with Cleanup"
echo "============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production file not found!${NC}"
    echo "Please create .env.production with your configuration."
    exit 1
fi

# Check for required environment variables
echo "📋 Checking environment configuration..."
if grep -q "CHANGE_THIS_TO_A_SECURE_RANDOM_STRING" .env.production; then
    echo -e "${YELLOW}⚠️  Warning: STACK_SERVER_SECRET is not set!${NC}"
    echo "   Generate a secure secret with: openssl rand -base64 32"
    echo ""
fi

if grep -q "YOUR_FREESTYLE_API_KEY_HERE" .env.production; then
    echo -e "${YELLOW}⚠️  Warning: STACK_FREESTYLE_API_KEY is not set!${NC}"
    echo "   Get your API key from: https://freestyle.sh"
    echo ""
fi

# Stop all Stack Auth related containers
echo "🧹 Stopping all Stack Auth containers..."
docker ps -a | grep -E "stack-dependencies|stack-auth|stack-postgres" | awk '{print $1}' | xargs -r docker stop 2>/dev/null || true
echo -e "${GREEN}✓ Containers stopped${NC}"

# Remove all Stack Auth related containers
echo "🗑️  Removing all Stack Auth containers..."
docker ps -a | grep -E "stack-dependencies|stack-auth|stack-postgres" | awk '{print $1}' | xargs -r docker rm 2>/dev/null || true
echo -e "${GREEN}✓ Containers removed${NC}"

# Kill processes using ports 8101 and 8102
echo "🔪 Killing processes using ports 8101 and 8102..."
lsof -ti :8101 | xargs -r kill -9 2>/dev/null || true
lsof -ti :8102 | xargs -r kill -9 2>/dev/null || true
echo -e "${GREEN}✓ Ports freed${NC}"

# Wait a moment for ports to be released
sleep 2

# Start Postgres
echo "🐘 Starting PostgreSQL database..."
docker run -d \
    --name stack-postgres-prod \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=stackframe \
    -p 5432:5432 \
    postgres:latest

# Wait for Postgres to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec stack-postgres-prod pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}Error: PostgreSQL failed to start!${NC}"
        docker logs stack-postgres-prod
        exit 1
    fi
    sleep 1
done

# Pull latest Stack Auth image
echo "📦 Pulling latest Stack Auth image..."
docker pull stackauth/server:latest

# Start Stack Auth server
echo "🚀 Starting Stack Auth server..."
docker run -d \
    --name stack-auth-server \
    --env-file .env.production \
    -p 8101:8101 \
    -p 8102:8102 \
    stackauth/server:latest

# Wait for Stack Auth to start
echo "⏳ Waiting for Stack Auth to start..."
sleep 10

# Check if Stack Auth is running
if ! docker ps | grep -q stack-auth-server; then
    echo -e "${RED}Error: Stack Auth failed to start!${NC}"
    echo ""
    echo "Container logs:"
    docker logs stack-auth-server
    exit 1
fi

# Check if services are responding
echo "🔍 Checking if services are responding..."
sleep 5

# Try to reach the dashboard
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8101 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ Dashboard is responding${NC}"
else
    echo -e "${YELLOW}⚠️  Dashboard may still be starting up${NC}"
fi

# Try to reach the API
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8102 | grep -q "200\|301\|302\|404"; then
    echo -e "${GREEN}✓ API is responding${NC}"
else
    echo -e "${YELLOW}⚠️  API may still be starting up${NC}"
fi

echo ""
echo "============================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "============================================="
echo ""
echo "📍 Access your Stack Auth instance:"
echo -e "   ${BLUE}Dashboard: http://localhost:8101${NC}"
echo -e "   ${BLUE}API:       http://localhost:8102${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Open the dashboard at http://localhost:8101"
echo "   2. Create your admin account"
echo "   3. Configure your project settings"
echo "   4. Update your app's environment:"
echo "      NEXT_PUBLIC_STACK_API_URL=http://localhost:8102"
echo ""
echo "🔍 View logs:"
echo "   Stack Auth: docker logs -f stack-auth-server"
echo "   PostgreSQL: docker logs -f stack-postgres-prod"
echo ""
echo "🛑 Stop services:"
echo "   docker stop stack-auth-server stack-postgres-prod"
echo ""
echo "📚 For more information, see PRODUCTION-SETUP.md"
echo ""
