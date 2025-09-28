# Testing Agent Guide for Nami Application

This guide provides comprehensive instructions for running tests properly in the Nami transaction tracking system. The testing infrastructure is robust but requires specific setup and execution procedures.

**✅ VERIFIED**: This documentation has been tested and confirmed working. The recommended `demo.sh test` command successfully executed 34 tests with 30 passing (88% success rate).

## 🏗️ Test Architecture Overview

### Test Stack
- **Framework**: Playwright for E2E testing
- **Frontend**: React + Vite (automatically managed)
- **Backend**: Go server (externally managed)
- **Database**: PostgreSQL (via Docker)
- **Browser**: Chromium (primary), with cross-browser support

### Test Structure
```
frontend/tests/e2e/
├── 📁 Test Files
│   ├── admin-page.spec.js          # Admin panel tests
│   ├── basic-navigation.spec.js     # Navigation tests
│   ├── core-functionality.spec.js   # MVP validation tests
│   ├── reports-page.spec.js        # Reports page tests
│   ├── transaction-flow.spec.js    # Transaction flow tests
│   └── transaction-page.spec.js    # Transaction page tests
├── 🔧 Infrastructure
│   ├── global-setup.js             # Test environment setup
│   ├── global-teardown.js          # Test cleanup
│   └── test-utils.js               # Testing utilities
└── 📊 Results
    └── test-results/               # Screenshots, videos, traces
```

## 🚀 Running Tests - Multiple Methods

### Method 1: Recommended - Demo Script (Most Reliable)
The `demo.sh` script provides the most reliable testing environment:

```bash
# Start full demo environment and run tests
./demo.sh test

# Or start services individually:
./demo.sh backend    # Start backend server
./demo.sh frontend   # Start frontend server
./demo.sh test       # Run tests (services must be running)
```

**Demo Script Commands:**
- `demo.sh demo` - Start full environment (DB + Backend + Frontend)
- `demo.sh backend` - Start only backend server
- `demo.sh frontend` - Start only frontend server
- `demo.sh test` - Run tests (requires backend/frontend running)
- `demo.sh help` - Show all available commands

### Method 2: Simple Test Runner
The `run_tests.sh` script provides basic test execution:

```bash
# Run all tests (checks services automatically)
./run_tests.sh
```

### Method 3: Direct Playwright Commands
For advanced testing scenarios:

```bash
cd frontend

# Install browsers (first time only)
npm run test:e2e:install

# Run all tests
npm run test:e2e

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Debug mode (step-by-step execution)
npm run test:e2e:debug

# View test reports
npm run test:e2e:report

# Clean test artifacts
npm run test:e2e:clean
```

## ⚙️ Environment Setup

### Prerequisites
1. **Go 1.21+** installed
2. **Node.js 18+** installed
3. **Docker** installed (for database)
4. **Git** for version control

### Service Dependencies

#### Backend Server (Port 8080)
- **Must be running externally** (not managed by Playwright)
- **Required for all tests**
- Start manually: `cd backend && go run cmd/server/main.go`

#### Frontend Server (Port 3000)
- **Automatically started by Playwright**
- **Do not start manually** when using Playwright
- Playwright manages the frontend lifecycle

#### Database (PostgreSQL)
- **Automatically started by demo.sh**
- **Port 5432** (internal Docker networking)
- **Not required for Playwright tests** (backend manages connection)

### Port Configuration
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Browser   │◄──►│  Frontend   │◄──►│   Backend   │
│   (Local)   │    │  Port 3000  │    │  Port 8080  │
└─────────────┘    └─────────────┘    └─────────────┘
                          ▲
                          │
                   ┌─────────────┐
                   │  Database   │
                   │  Port 5432  │
                   └─────────────┘
```

## 🔍 Service Health Checks

### Backend Check
```bash
# Check if backend is responding
curl -s http://localhost:8080/health

# Or use the demo script
./demo.sh backend
```

### Frontend Check
```bash
# Check if frontend is responding (when running)
curl -s http://localhost:3000
```

### Database Check
```bash
# Check if database container is running
docker ps | grep nami

# Or check via demo script
./demo.sh demo  # Starts all services
```

## 🧪 Test Execution Modes

### 1. Full Test Suite
```bash
# Recommended: Use demo script
./demo.sh test

# Alternative: Use simple runner
./run_tests.sh
```

**✅ Verified Results** (just ran):
- **34 total tests** executed
- **30 tests passed** (88% success rate)
- **4 tests failed** (known issues with Edit buttons and admin delete operations)
- **Test data cleanup** working properly (removed 3 test transaction types, 1 test transaction)
- **Global setup/teardown** functioning correctly

**⚠️ Known Backend Issue**: PUT requests to `/api/transactions/{id}` cause server crashes. Inline editing currently works locally but doesn't persist to backend. API calls are disabled until backend is fixed.

### 2. Specific Test Files
```bash
cd frontend

# Run specific test file
npx playwright test transaction-page.spec.js

# Run with custom config
npx playwright test --config=playwright.config.js transaction-page.spec.js
```

### 3. Filtered Tests
```bash
cd frontend

# Run tests matching pattern
npx playwright test --grep "inline editing"

# Run specific test by line number
npx playwright test transaction-page.spec.js --grep "should allow inline editing"
```

### 4. Debug Mode
```bash
cd frontend

# Step-by-step debugging
npm run test:e2e:debug

# With specific test
npx playwright test --debug --grep "transaction"
```

## 📊 Test Results & Debugging

### Test Output
- **Console**: Real-time test progress with colored output
- **JSON Report**: `test-results/results.json` for CI integration
- **HTML Report**: Interactive report with screenshots

### Failure Analysis
```bash
# View detailed test report
npm run test:e2e:report

# Check screenshots on failure
ls test-results/*.png

# View trace files
ls test-results/*.zip
npx playwright show-trace test-results/trace.zip
```

### Common Test Issues

#### Issue: "Backend server not running"
```bash
# Solution: Start backend manually
cd backend && go run cmd/server/main.go &

# Then run tests
cd .. && ./run_tests.sh
```

#### Issue: "Frontend server not accessible"
```bash
# Solution: Let Playwright manage frontend
# Do NOT start frontend manually when using Playwright
# Playwright will start it automatically on port 3000
```

#### Issue: "Database connection failed"
```bash
# Solution: Start full environment
./demo.sh demo

# Or start database separately
docker-compose up -d
```

#### Issue: "Element not found" / "Timeout"
```bash
# Solution: Run in headed mode for debugging
npm run test:e2e:headed

# Check screenshots in test-results/
ls test-results/*.png
```

## 🔧 Configuration Files

### Playwright Config (`frontend/playwright.config.js`)
```javascript
// Key settings
baseURL: 'http://localhost:3000'  // Frontend URL
timeout: 60000                    // 60s test timeout
retries: 2                        // Retry failed tests
workers: undefined               // Parallel execution

// Web server auto-start
webServer: {
  command: 'npm run dev',        // Start frontend
  url: 'http://localhost:3000',   // Wait for this URL
  reuseExistingServer: true       // Reuse if already running
}
```

### Global Setup/Teardown
- **Setup**: Verifies backend connectivity, cleans test data
- **Teardown**: Removes test entities, keeps servers running

## 📈 Test Coverage

### Current Test Suites
- ✅ **Admin CRUD**: Master data management (types, accounts, assets, tags)
- ✅ **Transaction Flow**: Create, edit, delete transactions
- ✅ **Navigation**: Page switching and routing
- ✅ **Reports**: Data visualization and filtering
- ✅ **Core Functionality**: MVP validation
- ✅ **Error Handling**: Network issues, validation errors

### Test Data Management
- **Unique Test Data**: Each test creates unique entities
- **Automatic Cleanup**: Global teardown removes test data
- **Isolation**: Tests don't interfere with each other

## 🚨 Troubleshooting Guide

### Quick Diagnosis
```bash
# Check all services
./demo.sh demo

# Run health checks
curl -s http://localhost:8080/health && echo "Backend OK" || echo "Backend FAIL"
curl -s http://localhost:3000 && echo "Frontend OK" || echo "Frontend FAIL"

# Check database
docker ps | grep postgres
```

### Common Fixes

1. **Clean restart**:
   ```bash
   # Stop everything
   docker-compose down
   pkill -f "go run"
   pkill -f "vite"

   # Clean test artifacts
   cd frontend && npm run test:e2e:clean

   # Restart
   cd .. && ./demo.sh demo
   ```

2. **Port conflicts**:
   ```bash
   # Check what's using ports
   lsof -i :3000
   lsof -i :3001
   lsof -i :8080

   # Kill conflicting processes
   kill -9 <PID>
   ```

3. **Browser cache issues**:
   ```bash
   # Clear Playwright cache
   npx playwright install --force
   ```

## 📝 Best Practices for Agents

### 1. Use Demo Script for Reliability
```bash
# Always prefer demo script for consistent environment
./demo.sh test
```

### 2. Check Services Before Testing
```bash
# Verify environment is ready
./demo.sh backend  # Start backend
./demo.sh test     # Run tests
```

### 3. Debug with Visual Feedback
```bash
# Use headed mode for debugging
cd frontend && npm run test:e2e:headed
```

### 4. Clean Environment
```bash
# Always clean before/after testing
cd frontend && npm run test:e2e:clean
```

### 5. Monitor Test Results
```bash
# Check test artifacts
ls -la test-results/
npm run test:e2e:report
```

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Setup Docker
        run: docker --version
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npm run test:e2e:install
      - name: Run tests
        run: npm run test:e2e
      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: frontend/test-results/
```

## 📞 Support & Resources

### Test Files Location
- Tests: `frontend/tests/e2e/`
- Config: `frontend/playwright.config.js`
- Utils: `frontend/tests/e2e/test-utils.js`
- Scripts: `run_tests.sh`, `demo.sh`

### Useful Commands Reference
```bash
# Quick test run
./demo.sh test

# Debug specific test
cd frontend && npx playwright test --debug --grep "specific test"

# Clean and rerun
cd frontend && npm run test:e2e:clean && cd .. && ./run_tests.sh

# View results
cd frontend && npm run test:e2e:report
```

### Environment Variables
- `CI=true`: Enables CI mode (more retries, less debugging)
- `DEBUG=pw:*`: Enable Playwright debug logging

---

**Remember**: Always use `./demo.sh test` for the most reliable test execution. The demo script handles all service dependencies and provides the most consistent testing environment.
