#!/bin/bash

# Test Backend Startup Script
# Starts the backend on port 8001 for testing

set -e

echo "🚀 Starting test backend on port 8001..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
BACKEND_PORT=8001
DB_HOST=localhost
DB_PORT=5434
DB_NAME=nami_test
DB_USER=nami_test_user
DB_PASSWORD=nami_test_password

# Check if we're in the backend directory
if [ ! -f "go.mod" ]; then
    echo -e "${RED}❌ Error: Not in backend directory${NC}"
    echo -e "${YELLOW}Please run this script from the backend directory${NC}"
    exit 1
fi

# Check if database is running
echo -e "${BLUE}🔍 Checking database connection...${NC}"
if command -v docker >/dev/null 2>&1; then
    if docker-compose -f ../docker-compose.test.yml ps postgres-test | grep -q "Up"; then
        echo -e "${GREEN}✅ Test database is running${NC}"
    else
        echo -e "${RED}❌ Test database is not running${NC}"
        echo -e "${YELLOW}Please run: ./scripts/setup-test-env.sh${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Docker not available, assuming database is running${NC}"
fi

# Set environment variables
export SERVER_PORT=$BACKEND_PORT
export GIN_PORT=$BACKEND_PORT
export POSTGRES_HOST=$DB_HOST
export POSTGRES_PORT=$DB_PORT
export POSTGRES_DB=$DB_NAME
export POSTGRES_USER=$DB_USER
export POSTGRES_PASSWORD=$DB_PASSWORD
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=disable"

echo -e "${BLUE}🔧 Environment variables set:${NC}"
echo -e "   SERVER_PORT: $SERVER_PORT"
echo -e "   GIN_PORT: $GIN_PORT"
echo -e "   DATABASE_URL: $DATABASE_URL"

# Check if port is available
if lsof -i :$BACKEND_PORT >/dev/null 2>&1; then
    echo -e "${RED}❌ Port $BACKEND_PORT is already in use${NC}"
    echo -e "${YELLOW}Please stop the service using port $BACKEND_PORT${NC}"
    exit 1
fi

# Start the backend
echo -e "${BLUE}🚀 Starting backend server...${NC}"
echo -e "${GREEN}Backend will be available at: http://localhost:$BACKEND_PORT${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo

# Run the backend
go run cmd/server/main.go