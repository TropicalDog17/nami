import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    reporters: 'default',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false,
    coverage: { enabled: false },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000
  }
})


