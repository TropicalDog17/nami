// Test utilities for common scenarios and backend connectivity handling

/**
 * Wait for backend to be ready and handle connectivity issues
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Timeout in milliseconds
 */
async function waitForBackendReady(page, timeout = 30000) {
  console.log('⏳ Waiting for backend to be ready...');
  
  const startTime = Date.now();
  let backendReady = false;
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check if backend is offline
      const offlineMessages = page.locator('text=/offline|unavailable|error/i');
      const offlineCount = await offlineMessages.count();
      
      if (offlineCount === 0) {
        // Check if we have data or at least a functional UI
        const hasData = await page.locator('table tbody tr').count() > 0;
        const hasLoadingState = await page.locator('text=Loading').isVisible();
        const hasEmptyState = await page.locator('text=No data').isVisible();
        
        if (hasData || hasLoadingState || hasEmptyState) {
          backendReady = true;
          break;
        }
      } else {
        // Try to reconnect if retry button is available
        const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")');
        if (await retryButton.isVisible()) {
          console.log('🔄 Attempting to reconnect to backend...');
          await retryButton.click();
          await page.waitForTimeout(3000);
          
          // Check again if backend is still offline
          const stillOffline = await offlineMessages.count();
          if (stillOffline === 0) {
            backendReady = true;
            break;
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Error checking backend status:', error.message);
    }
    
    await page.waitForTimeout(1000);
  }
  
  if (!backendReady) {
    console.log('⚠️ Backend not ready after timeout, tests may fail');
  } else {
    console.log('✅ Backend is ready');
  }
  
  return backendReady;
}

/**
 * Handle form submission with better error handling and retry logic
 * @param {Page} page - Playwright page object
 * @param {string} submitButtonSelector - Selector for submit button
 * @param {Object} options - Additional options
 */
async function handleFormSubmission(page, submitButtonSelector, options = {}) {
  const {
    waitForSuccess = true,
    successMessage = 'success',
    errorMessage = 'error',
    timeout = 10000
  } = options;
  
  console.log('📤 Submitting form...');
  
  // Set up console and network monitoring
  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push(`${msg.type()}: ${msg.text()}`);
  });
  
  const networkRequests = [];
  page.on('request', (request) => {
    networkRequests.push(`${request.method()} ${request.url()}`);
  });
  
  const networkResponses = [];
  page.on('response', (response) => {
    networkResponses.push(`${response.status()} ${response.url()}`);
  });
  
  try {
    // Click submit button
    await page.click(submitButtonSelector);
    
    if (waitForSuccess) {
      // Wait for success or error
      await page.waitForTimeout(3000);
      
      // Check for success
      const hasSuccessMessage = await page.locator(`text=/${successMessage}/i`).isVisible();
      const formClosed = await page.locator('form').isVisible() === false;
      
      // Check for errors
      const hasErrorMessage = await page.locator(`text=/${errorMessage}/i`).isVisible();
      const formStillOpen = await page.locator('form').isVisible();
      
      // Log debugging information
      console.log('Console messages:', consoleMessages.slice(-5)); // Last 5 messages
      console.log('Network requests:', networkRequests.slice(-3)); // Last 3 requests
      console.log('Network responses:', networkResponses.slice(-3)); // Last 3 responses
      
      if (hasErrorMessage) {
        const errorText = await page.locator(`text=/${errorMessage}/i`).textContent();
        console.log('Form submission error:', errorText);
      }
      
      return {
        success: hasSuccessMessage || !formStillOpen,
        error: hasErrorMessage,
        messages: consoleMessages,
        requests: networkRequests,
        responses: networkResponses
      };
    }
    
    return { success: true };
  } catch (error) {
    console.log('❌ Form submission failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create test data with unique identifiers to avoid conflicts
 * @param {string} prefix - Prefix for test data
 * @returns {Object} Test data object with unique identifiers
 */
function createTestData(prefix = 'test') {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  
  return {
    name: `${prefix}_${timestamp}_${randomSuffix}`,
    description: `Test ${prefix} created at ${new Date(timestamp).toISOString()}`,
    timestamp,
    randomSuffix
  };
}

/**
 * Wait for and handle dialog confirmations
 * @param {Page} page - Playwright page object
 * @param {string} expectedMessage - Expected message in dialog
 */
async function handleDialogConfirmation(page, expectedMessage = 'Are you sure') {
  return new Promise((resolve) => {
    const handler = async (dialog) => {
      console.log('🔔 Dialog appeared:', dialog.message());
      if (!dialog.message().includes(expectedMessage)) {
        console.error(`❌ Dialog message "${dialog.message()}" does not contain expected "${expectedMessage}"`);
      }
      await dialog.accept();
      page.off('dialog', handler); // Remove listener after handling
      resolve();
    };
    page.on('dialog', handler);
  });
}

/**
 * Check if element exists and is visible with retry logic
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {number} timeout - Timeout in milliseconds
 */
async function waitForElementVisible(page, selector, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        return true;
      }
    } catch (error) {
      // Element not found or not visible, continue waiting
    }
    
    await page.waitForTimeout(500);
  }
  
  return false;
}

/**
 * Take screenshot on failure with descriptive filename
 * @param {Page} page - Playwright page object
 * @param {string} testName - Name of the test
 */
async function takeScreenshotOnFailure(page, testName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `failure-${testName}-${timestamp}.png`;
  
  await page.screenshot({ 
    path: `test-results/${filename}`,
    fullPage: true 
  });
  
  console.log(`📸 Screenshot saved: ${filename}`);
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in milliseconds
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let retryCount = 0;
  let lastError;
  
  while (retryCount < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      retryCount++;
      
      if (retryCount < maxRetries) {
        const delay = initialDelay * Math.pow(2, retryCount - 1);
        console.log(`⚠️ Attempt ${retryCount} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`❌ All ${maxRetries} attempts failed`);
  throw lastError;
}

/**
 * Wait for network idle (no active network requests)
 * @param {Page} page - Playwright page object
 * @param {number} timeout - Timeout in milliseconds
 */
async function waitForNetworkIdle(page, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const requests = await page.evaluate(() => {
      return performance.getEntriesByType('resource').filter(entry => 
        entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch'
      ).length;
    });
    
    if (requests === 0) {
      return true;
    }
    
    await page.waitForTimeout(500);
  }
  
  return false;
}

/**
 * Check if backend is offline and handle appropriately
 * @param {Page} page - Playwright page object
 */
async function handleBackendOffline(page) {
  const offlineMessages = page.locator('text=/offline|unavailable|connection.*failed/i');
  const offlineCount = await offlineMessages.count();
  
  if (offlineCount > 0) {
    console.log('⚠️ Backend is offline');
    
    // Look for retry button
    const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")');
    if (await retryButton.isVisible()) {
      console.log('🔄 Clicking retry button...');
      await retryButton.click();
      await page.waitForTimeout(3000);
      
      // Check if backend is back online
      const stillOffline = await offlineMessages.count();
      if (stillOffline === 0) {
        console.log('✅ Backend is back online');
        return true;
      } else {
        console.log('⚠️ Backend still offline after retry');
        return false;
      }
    }
  }
  
  return true; // Backend is online
}

export {
  waitForBackendReady,
  handleFormSubmission,
  createTestData,
  handleDialogConfirmation,
  waitForElementVisible,
  takeScreenshotOnFailure,
  retryWithBackoff,
  waitForNetworkIdle,
  handleBackendOffline
};
