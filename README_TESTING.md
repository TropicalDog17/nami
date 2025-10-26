# 🧪 Testing Environment Setup

This document explains how to run tests in an isolated environment that doesn't interfere with your daily usage.

## 🎯 Goal

- **Main App**: Runs on `localhost:3000` + `localhost:8080` (your daily usage)
- **Test Environment**: Runs on `localhost:3001` + `localhost:8001` (isolated testing)

## 🚀 Quick Start

### 1. One-Time Setup
```bash
# From the project root
./scripts/setup-test-env.sh
```

### 2. Start Test Backend
```bash
# From the backend directory
./scripts/start-test-backend.sh
```

### 3. Start Test Frontend
```bash
# From the frontend directory
./scripts/start-test-frontend.sh
```

### 4. Run Tests
```bash
# From the frontend directory
npm run test:e2e:isolated
```

## 📁 Test Environment Details

### Ports
- **Frontend**: `3001` (vs `3000` for main app)
- **Backend**: `8001` (vs `8080` for main app)
- **Database**: `5434` (vs `5432` for main app)

### Database
- **Name**: `nami_test`
- **User**: `nami_test_user`
- **Password**: `nami_test_password`
- **Port**: `5434`

### Environment Variables
```bash
PORT=3001
VITE_API_BASE_URL=http://localhost:8001
GIN_PORT=8001
DATABASE_URL=postgresql://nami_test_user:nami_test_password@localhost:5434/nami_test?sslmode=disable
```

## 🛠️ Available Scripts

### From Project Root
```bash
./scripts/setup-test-env.sh          # One-time test environment setup
```

### From Frontend Directory
```bash
npm run test:e2e:isolated          # Run tests on port 3001/8001
npm run test:e2e:isolated:headed   # Run tests with browser UI
npm run test:setup                   # Set up test environment
npm run test:backend                 # Start test backend
npm run test:frontend                # Start test frontend
```

### From Backend Directory
```bash
./scripts/start-test-backend.sh     # Start backend on port 8001
```

## 🔧 Manual Setup (if scripts don't work)

### 1. Database Setup
```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d postgres-test

# Or set up PostgreSQL manually on port 5434
# Database: nami_test
# User: nami_test_user
# Password: nami_test_password
```

### 2. Backend Setup
```bash
cd backend
GIN_PORT=8001 \
POSTGRES_HOST=localhost \
POSTGRES_PORT=5434 \
POSTGRES_DB=nami_test \
POSTGRES_USER=nami_test_user \
POSTGRES_PASSWORD=nami_test_password \
go run cmd/server/main.go
```

### 3. Frontend Setup
```bash
cd frontend
PORT=3001 \
VITE_API_BASE_URL=http://localhost:8001 \
npm run dev
```

## 🧹 Test Data Management

### Automatic Cleanup (Safe in Test Environment)
- Tests automatically clean up test data
- Uses isolated database, so no impact on your main data
- Only deletes clearly marked test data (`[E2E-TEST]`, `test-*`, etc.)

### Manual Cleanup
```bash
# Clean up test data
cd frontend
node scripts/safe-test-cleanup.js

# Or use admin interface at http://localhost:3001/admin
```

## 📝 Test Configuration

Test configuration is in `frontend/tests/e2e/test-config.js`:

```javascript
export const TEST_CONFIG = {
  FRONTEND_PORT: 3001,
  BACKEND_PORT: 8001,
  FRONTEND_URL: 'http://localhost:3001',
  BACKEND_URL: 'http://localhost:8001',
  PREFIX: '[E2E-TEST-]',
  // ... other test data configurations
};
```

## 🔍 Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3001  # Frontend
lsof -i :8001  # Backend
lsof -i :5434  # Database

# Stop the conflicting service
kill -9 <PID>
```

### Database Connection Issues
```bash
# Check if test database is running
docker-compose -f docker-compose.test.yml ps

# Restart database
docker-compose -f docker-compose.test.yml restart postgres-test
```

### Backend Not Responding
```bash
# Check backend logs
cd backend
GIN_PORT=8001 go run cmd/server/main.go

# Check if backend is accessible
curl http://localhost:8001/health
```

## 🎯 Best Practices

1. **Always use test scripts** - Don't manually start services
2. **Keep main app running** - Tests don't interfere with port 3000/8080
3. **Use test data prefixes** - `[E2E-TEST]` helps identify test data
4. **Run setup script first** - One-time setup ensures everything is ready
5. **Check ports before starting** - Scripts handle this automatically

## 🚀 Daily Workflow

### Your Main App (Unaffected)
```bash
# Your daily usage - completely separate from tests
cd frontend && npm run dev          # Port 3000
cd backend && go run cmd/server/main.go    # Port 8080
```

### Testing (Isolated)
```bash
# Testing - completely separate from your main app
npm run test:e2e:isolated         # Ports 3001/8001
```

Your daily usage and testing are now **completely isolated**! 🎉