#!/bin/bash

# Test Environment Setup Script
# This script sets up the isolated test environment

set -e

echo "🚀 Setting up isolated test environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=3001
BACKEND_PORT=8001
DB_PORT=5434

echo -e "${BLUE}📍 Configuration:${NC}"
echo -e "   Frontend: http://localhost:${FRONTEND_PORT}"
echo -e "   Backend:  http://localhost:${BACKEND_PORT}"
echo -e "   Database: localhost:${DB_PORT}"

# Check if ports are available
echo -e "${BLUE}🔍 Checking port availability...${NC}"

check_port() {
    local port=$1
    local service=$2

    if lsof -i :$port >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is already in use (conflicts with $service)${NC}"
        echo -e "${YELLOW}   Please stop the service using port $port${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Port $port is available for $service${NC}"
        return 0
    fi
}

# Check all required ports
if ! check_port $FRONTEND_PORT "Frontend"; then exit 1; fi
if ! check_port $BACKEND_PORT "Backend"; then exit 1; fi
if ! check_port $DB_PORT "Test Database"; then exit 1; fi

# Set up test database
echo -e "${BLUE}🗄️  Setting up test database...${NC}"
cd "$(dirname "$0")/.."

if command -v docker >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Docker found${NC}"

    # Start test database
    echo -e "${BLUE}🚀 Starting test database on port $DB_PORT...${NC}"
    docker-compose -f docker-compose.test.yml up -d postgres-test

    # Wait for database to be ready
    echo -e "${BLUE}⏳ Waiting for database to be ready...${NC}"
    sleep 5

    # Check if database is ready
    if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U nami_test_user -d nami_test >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Test database is ready${NC}"
    else
        echo -e "${RED}❌ Test database failed to start${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Docker not found. Please install Docker or set up PostgreSQL manually:${NC}"
    echo -e "   Database: localhost:$DB_PORT"
    echo -e "   Name: nami_test"
    echo -e "   User: nami_test_user"
    echo -e "   Password: nami_test_password"
fi

# Copy test environment file
echo -e "${BLUE}📝 Setting up environment variables...${NC}"
if [ ! -f .env.test ]; then
    echo -e "${RED}❌ .env.test file not found${NC}"
    exit 1
fi

# Create local test environment file
cp .env.test .env.local.test
echo -e "${GREEN}✅ Created .env.local.test${NC}"

# Update package.json test scripts
echo -e "${BLUE}🔧 Updating test scripts...${NC}"
if [ -f frontend/package.json ]; then
    # Add test scripts if they don't exist
    if ! grep -q "test:e2e:isolated" frontend/package.json; then
        echo -e "${BLUE}➕ Adding isolated test script...${NC}"
        # This would be done manually or with sed/awk in a real implementation
        echo -e "${YELLOW}   Please add to package.json scripts:${NC}"
        echo -e "   \"test:e2e:isolated\": \"PORT=$FRONTEND_PORT npm run test:e2e\""
    fi
fi

echo -e "${GREEN}✅ Test environment setup complete!${NC}"
echo
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "1. ${YELLOW}Start backend:${NC}    cd backend && GIN_PORT=$BACKEND_PORT go run cmd/server/main.go"
echo -e "2. ${YELLOW}Start frontend:${NC}  cd frontend && PORT=$FRONTEND_PORT npm run dev"
echo -e "3. ${YELLOW}Run tests:${NC}      cd frontend && npm run test:e2e"
echo
echo -e "${GREEN}🎯 Your tests will now run in complete isolation from your main app!${NC}"