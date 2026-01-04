import { beforeEach } from "vitest";

// Set default storage backend to JSON for tests
// Tests can override this by setting process.env.STORAGE_BACKEND = 'database'
beforeEach(() => {
  process.env.STORAGE_BACKEND = "json";
});

// If you want to run tests with database mode, set STORAGE_BACKEND=database when running tests:
// STORAGE_BACKEND=database npm test
