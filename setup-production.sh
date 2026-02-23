#!/bin/bash

# Stack Auth Production Setup Script
# This script helps you set up Stack Auth in production mode on your Mac

set -e

echo "🚀 Stack Auth Production Setup"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Stop and remove existing containers
echo "🧹 Cleaning up existing containers..."
docker stop stack-postgres-prod 2>/dev/null || true
docker rm stack-postgres-prod 2>/dev/null || true
docker stop stack-auth-server 2>/dev/null || true
docker rm stack-auth-server 2>/dev/null || true

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
sleep 10

# Check if Postgres is running
if ! docker ps | grep -q stack-postgres-prod; then
    echo -e "${RED}Error: PostgreSQL failed to start!${NC}"
    docker logs stack-postgres-prod
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is running${NC}"

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
sleep 5

# Check if Stack Auth is running
if ! docker ps | grep -q stack-auth-server; then
    echo -e "${RED}Error: Stack Auth failed to start!${NC}"
    docker logs stack-auth-server
    exit 1
fi

echo -e "${GREEN}✓ Stack Auth is running${NC}"
echo ""
echo "================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "================================"
echo ""
echo "📍 Access your Stack Auth instance:"
echo "   Dashboard: http://localhost:8101"
echo "   API:       http://localhost:8102"
echo ""
echo "📝 Next steps:"
echo "   1. Open the dashboard at http://localhost:8101"
echo "   2. Create your admin account"
echo "   3. Configure your project settings"
echo ""
echo "🔍 View logs:"
echo "   Stack Auth: docker logs -f stack-auth-server"
echo "   PostgreSQL: docker logs -f stack-postgres-prod"
echo ""
echo "🛑 Stop services:"
echo "   docker stop stack-auth-server stack-postgres-prod"
echo ""
