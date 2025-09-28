#!/bin/bash

# Simple test runner for Nami that avoids shell environment issues

echo "🚀 Running Nami E2E Tests"
echo ""

# Check if backend is running
echo "🔍 Checking backend..."
if curl -s http://localhost:8080/health >/dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running on port 8080"
    echo "Please start the backend first:"
    echo "  cd backend && go run cmd/server/main.go &"
    exit 1
fi

# Check if frontend is running
echo "🔍 Checking frontend..."
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend is not running on port 3000"
    echo "Please start the frontend first:"
    echo "  cd frontend && npm run dev &"
    exit 1
fi

echo ""
echo "🧪 Running tests..."
cd frontend

# Run playwright with a clean environment
env -i PATH="$PATH" HOME="$HOME" USER="$USER" npx playwright test --config=playwright.config.js --reporter=line --timeout=60000

EXIT_CODE=$?

cd ..

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed"
fi

exit $EXIT_CODE
