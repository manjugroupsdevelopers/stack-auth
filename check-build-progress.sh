#!/bin/bash

# Check Docker Build Progress

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "📊 Docker Build Progress Monitor"
echo "================================="
echo ""

# Check if build log exists
if [ ! -f /tmp/docker-build.log ]; then
    echo -e "${YELLOW}Build log not found yet. Build may be starting...${NC}"
    exit 0
fi

# Get last 30 lines
echo -e "${BLUE}Last 30 lines of build output:${NC}"
echo "-----------------------------------"
tail -30 /tmp/docker-build.log
echo "-----------------------------------"
echo ""

# Check for specific stages
if grep -q "Building entry:" /tmp/docker-build.log; then
    echo -e "${GREEN}✓ TypeScript compilation started${NC}"
fi

if grep -q "Build success" /tmp/docker-build.log; then
    echo -e "${GREEN}✓ Package builds completed${NC}"
fi

if grep -q "COPY --from=builder" /tmp/docker-build.log; then
    echo -e "${GREEN}✓ Creating final image${NC}"
fi

if grep -q "Build Successful" /tmp/docker-build.log; then
    echo ""
    echo -e "${GREEN}🎉 BUILD COMPLETE!${NC}"
    echo ""
    echo "Next: ./start-production.sh"
fi

if grep -q "Build Failed" /tmp/docker-build.log; then
    echo ""
    echo -e "${YELLOW}⚠️  Build encountered errors${NC}"
    echo "Check full log: cat /tmp/docker-build.log"
fi

echo ""
echo "To watch live: tail -f /tmp/docker-build.log"
