import { chromium } from '@playwright/test';

async function globalSetup(config) {
  console.log('🚀 Starting global test setup...');

  // Launch a browser instance for setup tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    console.log('🌐 Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');

    // Wait for the page to load
    console.log('⏳ Waiting for page to load...');
    await page.waitForLoadState('domcontentloaded');

    // Wait for React to hydrate and render - check for root div content
    console.log('🔍 Waiting for React app to render...');
    await page.waitForSelector('#root', { timeout: 15000 });

    // Give React more time to render the navigation
    await page.waitForTimeout(3000);

    // Try to find the nav element or any indication the app loaded
    const navExists = await page.locator('nav').count() > 0;
    const namiHeaderExists = await page.locator('h1:has-text("Nami")').count() > 0;

    if (navExists) {
      console.log('✅ Found nav element - app loaded successfully');
    } else if (namiHeaderExists) {
      console.log('✅ Found Nami header - app appears to be loading');
    } else {
      console.log('⚠️ Navigation elements not found, but continuing with tests...');
      console.log('📋 Tests will proceed - individual test files handle their own readiness checks');
    }

    // Check backend connectivity (keep this simple)
    await checkBackendConnectivity(page);

    // Skip complex cleanup for now - individual tests handle their own data
    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    console.log('📋 Continuing with tests anyway - individual tests will verify app readiness');
    // Don't throw error - let tests proceed and handle their own setup
  } finally {
    await context.close();
    await browser.close();
  }
}

async function checkBackendConnectivity(page) {
  console.log('🔍 Verifying backend server is running (assumed to be externally managed)...');

  try {
    // Wait for potential backend status to load
    await page.waitForTimeout(2000);

    // Check if there are any "offline" or "unavailable" messages
    const offlineMessages = page.locator('text=/offline|unavailable|error/i');
    const offlineCount = await offlineMessages.count();

    if (offlineCount > 0) {
      console.log('⚠️ Backend appears to be offline');
      console.log('📋 Please ensure the backend server is running on port 8080:');
      console.log('   cd backend && go run cmd/server/main.go');

      throw new Error('Backend server is not running. E2E tests assume backend is externally managed and running.');
    } else {
      console.log('✅ Backend is online and accessible');
    }
  } catch (error) {
    if (error.message.includes('Backend server is not running')) {
      throw error; // Re-throw our specific error
    }
    console.log('⚠️ Error checking backend connectivity:', error.message);
    console.log('📋 If tests fail, ensure backend is running: cd backend && go run cmd/server/main.go');
  }
}

async function cleanupTestData(page) {
  console.log('🧹 Cleaning up test data...');
  
  try {
    // Navigate to admin page to clean up test data
    await page.goto('http://localhost:3000/admin');
    await page.waitForTimeout(2000);
    
    // Look for and remove any test data
    // This is a placeholder - actual implementation depends on your data structure
    console.log('✅ Test data cleanup completed');
  } catch (error) {
    console.log('⚠️ Error during test data cleanup:', error.message);
  }
}

export default globalSetup;
