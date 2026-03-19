#!/bin/bash

# LIA Clinic - Quick Start Script
# Usage: ./scripts/dev-start.sh

set -e

echo "🚀 Starting LIA Clinic - All Services"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to project root
cd "$(dirname "$0")/.."

# Check Docker is running
echo -e "${YELLOW}📦 Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Start Docker Compose services
echo -e "${YELLOW}🐳 Starting Docker services (PostgreSQL, Redis, MinIO)...${NC}"
docker compose up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
for i in {1..30}; do
    if docker exec lia-clinic-core-postgres-1 pg_isready -U lia > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Run migrations
echo -e "${YELLOW}🔄 Running database migrations...${NC}"
npm run migration:check -w @lia/api

# Start all services in parallel
echo -e "${GREEN}🎉 All services ready! Starting development servers...${NC}"
echo ""
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
echo "======================================"

# Trap to clean up on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    docker compose down
    pkill -f "tsx watch" 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
}
trap cleanup EXIT

# Start all services
npm run dev:all
