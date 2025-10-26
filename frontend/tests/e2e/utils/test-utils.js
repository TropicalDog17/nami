// Shared Playwright test utilities for stability and maintainability

/**
 * Wait for backend health endpoint to be ready.
 * Defaults to http://localhost:8001/health used by isolated env.
 */
export async function waitForBackendHealth(request, {
  baseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:8001',
  path = '/health',
  maxAttempts = 30,
  delayMs = 1000,
} = {}) {
  const url = `${baseUrl}${path}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await request.get(url);
      if (res.ok()) return true;
    } catch (_) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Backend not healthy at ${url} after ${maxAttempts} attempts`);
}

/**
 * Navigate using baseURL-relative path and wait for network to be idle.
 */
export async function gotoAndWait(page, path) {
  await page.goto(path);
  // Ensure DOM loaded, then settle network
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

/**
 * Close a modal by waiting for its heading text to be hidden.
 */
export async function waitModalClosedByHeading(page, headingText, timeout = 10000) {
  await page.locator(`text=${headingText}`).first().waitFor({ state: 'hidden', timeout });
}

/**
 * Generate a unique name with a prefix for test data isolation.
 */
export function uniqueName(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now();
  return `${prefix}-${ts}-${rand}`;
}



