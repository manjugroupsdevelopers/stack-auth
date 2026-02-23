#!/bin/bash

set -e

echo "🔨 Rebuilding Docker image with ClickHouse and S3 fixes..."
echo "=========================================="

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.production.yml down

# Build with high memory
echo "🏗️  Building Docker image..."
./build-with-high-memory.sh

# Start services
echo "🚀 Starting services..."
./start-production.sh

echo ""
echo "=========================================="
echo "✅ Rebuild and restart complete!"
echo "=========================================="
echo ""
echo "📊 Dashboard: http://localhost:8101"
echo "🔌 API:       http://localhost:8102"
echo ""
echo "Check logs with:"
echo "  docker-compose -f docker-compose.production.yml logs -f stack-auth"
