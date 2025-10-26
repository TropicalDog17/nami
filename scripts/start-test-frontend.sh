#!/bin/bash

# Test Frontend Startup Script
# Starts the frontend on port 3001 for testing

set -e

echo "🚀 Starting test frontend on port 3001..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
FRONTEND_PORT=3001
BACKEND_PORT=8001

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Not in frontend directory${NC}"
    echo -e "${YELLOW}Please run this script from the frontend directory${NC}"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    npm install
fi

# Check if port is available
if lsof -i :$FRONTEND_PORT >/dev/null 2>&1; then
    echo -e "${RED}❌ Port $FRONTEND_PORT is already in use${NC}"
    echo -e "${YELLOW}Please stop the service using port $FRONTEND_PORT${NC}"
    exit 1
fi

# Check if backend is running
echo -e "${BLUE}🔍 Checking backend connection...${NC}"
if curl -s http://localhost:$BACKEND_PORT/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running on port $BACKEND_PORT${NC}"
else
    echo -e "${RED}❌ Backend is not running on port $BACKEND_PORT${NC}"
    echo -e "${YELLOW}Please run: ./scripts/start-test-backend.sh${NC}"
    exit 1
fi

# Set environment variables
export PORT=$FRONTEND_PORT
export VITE_API_BASE_URL="http://localhost:$BACKEND_PORT"

echo -e "${BLUE}🔧 Environment variables set:${NC}"
echo -e "   PORT: $PORT"
echo -e "   VITE_API_BASE_URL: $VITE_API_BASE_URL"

# Start the frontend
echo -e "${BLUE}🚀 Starting frontend development server...${NC}"
echo -e "${GREEN}Frontend will be available at: http://localhost:$FRONTEND_PORT${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo

# Run the frontend
npm run dev