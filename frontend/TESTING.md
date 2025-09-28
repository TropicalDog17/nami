# Testing Guide for Nami Application

This document provides comprehensive guidelines for testing the Nami transaction tracking system using Playwright.

## Test Structure

### Test Files Organization

```
frontend/tests/e2e/
├── admin-crud.spec.js          # Admin panel CRUD operations
├── admin-page.spec.js          # Admin page specific tests
├── basic-navigation.spec.js     # Basic navigation tests
├── core-functionality.spec.js   # Core MVP functionality tests
├── debug-admin.spec.js         # Debug tests for admin functionality
├── reports-functionality.spec.js # Reports page functionality tests
├── reports-page.spec.js        # Reports page specific tests
├── transaction-flow.spec.js    # Transaction management flow tests
└── transaction-page.spec.js    # Transaction page specific tests
├── test-utils.js              # Common test utilities and helpers
├── global-setup.js            # Global test setup procedures
└── global-teardown.js         # Global test cleanup procedures
```

## Test Utilities

### Common Functions (test-utils.js)

The `test-utils.js` file provides reusable utilities for test scenarios:

- `waitForBackendReady()` - Waits for backend to be ready with retry logic
- `handleFormSubmission()` - Handles form submissions with error handling
- `createTestData()` - Creates unique test data to avoid conflicts
- `handleDialogConfirmation()` - Handles dialog confirmations
- `waitForElementVisible()` - Waits for elements to be visible with retry
- `takeScreenshotOnFailure()` - Takes screenshots on test failures
- `retryWithBackoff()` - Retries functions with exponential backoff
- `waitForNetworkIdle()` - Waits for network requests to complete
- `handleBackendOffline()` - Handles backend offline states

## Running Tests

### Prerequisites

1. **Backend Server**: Must be running externally (not managed by Playwright):
   ```bash
   cd backend
   go run cmd/server/main.go
   ```
   The backend runs on port 8080 and is assumed to be running throughout the test suite.

2. **Frontend Server**: Automatically started by Playwright:
   ```bash
   # Frontend will be started automatically by Playwright on port 3000
   ```

3. Install Playwright browsers (first time only):
   ```bash
   cd frontend
   npm run test:e2e:install
   ```

### Test Commands

```bash
# Run all tests in headless mode
npm run test:e2e

# Run all tests in headed mode (visible browser)
npm run test:e2e:headed

# Run tests with debug mode
npm run test:e2e:debug

# View test report
npm run test:e2e:report

# Clean test results
npm run test:e2e:clean

# Update Playwright
npm run test:e2e:update
```

### Running Specific Tests

```bash
# Run specific test file
npx playwright test --grep "Admin CRUD Operations"

# Run specific test with debug
npx playwright test --grep "should create a new transaction" --debug

# Run tests with specific project
npx playwright test --project=chromium
```

## Test Configuration

### Playwright Configuration (playwright.config.js)

- **Timeouts**: Increased timeouts for better reliability
  - Navigation timeout: 30s
  - Test timeout: 60s
  - Action timeout: 10s

- **Retries**: 
  - CI environment: 3 retries
  - Development environment: 2 retries

- **Reporting**:
  - HTML report with screenshots
  - JSON report for CI integration
  - List reporter for console output

- **Web Server**:
  - Automatic frontend server startup (port 3000)
  - Backend server must be running externally (port 8080)
  - Server reuse in development
  - 120s startup timeout

### Global Setup and Teardown

#### Global Setup (global-setup.js)

- Verifies backend server is running (externally managed)
- Fails fast if backend is not accessible
- Cleans up any existing test data
- Prepares test environment

#### Global Teardown (global-teardown.js)

- Cleans up test data only
- Backend server remains running
- Removes test entities from database
- Does not stop any servers

## Test Data Management

### Creating Test Data

Use the `createTestData()` utility to generate unique test data:

```javascript
const testData = createTestData('transaction');
// Returns: { name: "transaction_123456789_123", description: "Test transaction created at 2024-09-26T10:30:45.123Z", timestamp: 123456789, randomSuffix: 123 }
```

### Test Data Cleanup

The global teardown automatically cleans up:
- Transaction types with "test" or "e2e" in name
- Accounts with "test" or "e2e" in name
- Assets with "test" or "e2e" in name
- Tags with "test" or "e2e" in name
- Transactions with "test" or "e2e" in notes

## Backend Connectivity Handling

### Backend Server Assumption

Tests assume the backend server is running externally and fail fast if not available:

1. **Detection**: Checks for backend connectivity at test startup
2. **Fail Fast**: Tests will not run if backend is offline
3. **External Management**: Backend server lifecycle is managed outside Playwright
4. **Clear Instructions**: Provides specific commands to start backend if needed

### Retry Logic

- **Exponential Backoff**: Retries with increasing delays (1s, 2s, 4s, 8s)
- **Maximum Retries**: 3 attempts before failing
- **Error Handling**: Graceful handling of network and API errors

## Test Scenarios

### Admin CRUD Tests

- **Display Tests**: Verify all tabs and sections are visible
- **Navigation Tests**: Switch between tabs and verify state
- **CRUD Operations**: Create, read, update, delete operations
- **Form Validation**: Test required fields and error handling
- **Filtering**: Test search and filter functionality
- **Data Consistency**: Verify data persistence between tabs

### Transaction Flow Tests

- **Empty States**: Verify proper empty state handling
- **Form Operations**: Test transaction creation and editing
- **Currency Views**: Test USD/VND currency switching
- **CRUD Operations**: Create, update, delete transactions
- **Navigation**: Test navigation between sections

### Reports Functionality Tests

- **Tab Switching**: Test navigation between report types
- **Currency Views**: Test USD/VND currency switching
- **Date Filtering**: Test date range and preset filters
- **Data Display**: Verify proper data rendering
- **Empty States**: Test handling of no data scenarios
- **Export Functionality**: Test data export features

## Debugging Tests

### Screenshot on Failure

Tests automatically take screenshots when they fail:
- Saved to `test-results/` directory
- Named with test name and timestamp
- Full page screenshots for context

### Console and Network Logging

Tests log detailed information:
- Console messages (last 5 messages)
- Network requests (last 3 requests)
- Network responses (last 3 responses)
- Error details and stack traces

### Debug Mode

Run tests with debug mode for step-by-step execution:
```bash
npm run test:e2e:debug
```

## Best Practices

### Test Writing

1. **Use Test Utilities**: Leverage existing utilities for common scenarios
2. **Unique Test Data**: Always use `createTestData()` for unique identifiers
3. **Proper Timeouts**: Use appropriate timeouts and waits
4. **Error Handling**: Handle both success and error scenarios
5. **Cleanup**: Ensure tests clean up after themselves

### Test Organization

1. **Logical Grouping**: Group related tests in describe blocks
2. **Clear Names**: Use descriptive test names
3. **Independent Tests**: Each test should work in isolation
4. **Setup/Teardown**: Use beforeEach/afterEach for test state

### Backend Reliability

1. **Retry Logic**: Implement retry for transient failures
2. **Graceful Degradation**: Handle offline states gracefully
3. **Network Handling**: Wait for network idle when appropriate
4. **Error Boundaries**: Set appropriate error boundaries

## CI/CD Integration

### Running Tests in CI

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npm run test:e2e:install
      - name: Run tests
        run: npm run test:e2e
      - name: Upload report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Test Reporting

- **HTML Report**: Interactive report for local viewing
- **JSON Report**: Machine-readable results for CI
- **JUnit Report**: Compatible with various CI systems
- **Screenshots**: Automatic capture on failures

## Troubleshooting

### Common Issues

1. **Backend Server Not Running**:
   - Tests will fail immediately if backend is not accessible
   - Start backend manually: `cd backend && go run cmd/server/main.go`
   - Backend must run on port 8080 (not managed by Playwright)
   - Verify network connectivity and firewall settings

2. **Test Failures**:
   - Run tests in headed mode for visual debugging
   - Check screenshots for failure context
   - Review console and network logs

3. **Flaky Tests**:
   - Increase timeouts
   - Add more explicit waits
   - Check for race conditions

4. **Element Not Found**:
   - Verify selectors are correct
   - Check for dynamic content loading
   - Use waitForElementVisible utility

### Debug Commands

```bash
# Run specific failing test with debug
npx playwright test --grep "failing test name" --debug

# Run with trace for detailed execution
npx playwright test --trace on

# Run with video recording
npx playwright test --video=retain-on-failure
```

## Test Coverage

### Current Coverage

- ✅ Admin CRUD operations
- ✅ Basic navigation
- ✅ Core functionality
- ✅ Transaction management
- ✅ Reports functionality
- ✅ Backend connectivity handling
- ✅ Error scenarios
- ✅ Form validation
- ✅ Data filtering

### Planned Enhancements

- 🔄 Visual regression testing
- 🔄 Performance testing
- 🔄 Cross-browser testing
- 🔄 Mobile responsiveness testing
- 🔄 Accessibility testing
- 🔄 API contract testing

## Contributing

### Adding New Tests

1. Create new test file in `tests/e2e/` directory
2. Follow existing test patterns and utilities
3. Use descriptive test names and organize logically
4. Include setup, teardown, and error handling
5. Update this documentation with new test coverage

### Test Maintenance

1. Regularly update Playwright version
2. Review and update test utilities as needed
3. Clean up test results directory periodically
4. Update test documentation with new features
5. Monitor test flakiness and address issues
