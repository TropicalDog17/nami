/**
 * Vitest setup file for LLM tests
 */

import dotenv from 'dotenv'
import { vi } from 'vitest'

// Load environment variables
dotenv.config()

// Set test environment variables
process.env.NODE_ENV = 'test'

// Global test configuration
global.testConfig = {
  anthropic: {
    provider: 'anthropic' as const,
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN || '40133acb657d4343a13561fa2ae25e7a.XlBfpsO4chsOorMP',
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/anthropic',
    timeout: 30000
  },
  accounts: [
    { name: 'Cash', id: 'cash' },
    { name: 'Techcombank', id: 'tcb' },
    { name: 'VPBank', id: 'vpb' },
    { name: 'Momo Wallet', id: 'momo' }
  ],
  tags: [
    { name: 'Food', id: 'food' },
    { name: 'Transport', id: 'transport' },
    { name: 'Shopping', id: 'shopping' },
    { name: 'Entertainment', id: 'entertainment' },
    { name: 'Bills', id: 'bills' }
  ]
}

// Mock console methods in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}