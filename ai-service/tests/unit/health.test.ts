import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HealthChecker } from '../../src/api/health.js'
import { AppConfig } from '../../src/utils/config.js'

describe('HealthChecker', () => {
  let healthChecker: HealthChecker
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      TELEGRAM_BOT_TOKEN: 'test:1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
      OPENAI_API_KEY: 'sk-test1234567890abcdef',
      BACKEND_BASE_URL: 'http://localhost:3000',
      BACKEND_SIGNING_SECRET: 'test-secret-16-chars',
      SERVICE_BASE_URL: 'http://localhost:8081',
      PORT: 8081,
      ALLOWED_CHAT_IDS: '123456789',
      DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',
      allowedChatIds: new Set(['123456789'])
    }

    healthChecker = new HealthChecker(mockConfig)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with correct configuration', () => {
    expect(healthChecker).toBeInstanceOf(HealthChecker)
  })

  it('should pass configuration validation', async () => {
    const health = await healthChecker.checkHealth()
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status)
    expect(health.timestamp).toBeDefined()
    expect(health.uptime).toBeGreaterThan(0)
    expect(health.checks).toBeDefined()
    expect(health.summary).toBeDefined()
  })

  it('should fail configuration validation with missing token', async () => {
    const badConfig = {
      ...mockConfig,
      TELEGRAM_BOT_TOKEN: ''
    }
    const badHealthChecker = new HealthChecker(badConfig)
    const health = await badHealthChecker.checkHealth()

    expect(health.checks.config.status).toBe('unhealthy')
    expect(health.checks.config.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Telegram bot token')])
    )
  })

  it('should update grounding data correctly', () => {
    const accounts = [{ name: 'Bank' }, { name: 'Cash' }]
    const tags = [{ name: 'food' }, { name: 'transport' }]

    healthChecker.updateGroundingData(accounts, tags)

    // Mock the logger to avoid issues in test
    const mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }

    const health = healthChecker.checkGrounding(mockLogger as any)
    expect(health.status).toBe('healthy')
    expect(health.accounts).toBe(2)
    expect(health.tags).toBe(2)
  })

  it('should detect stale grounding data', () => {
    const accounts = [{ name: 'Bank' }]
    const tags = [{ name: 'food' }]

    healthChecker.updateGroundingData(accounts, tags)

    // Mock time to make data appear stale
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 60 * 1000) // 15 minutes later

    // Mock the logger to avoid issues in test
    const mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }

    const health = healthChecker.checkGrounding(mockLogger as any)
    expect(health.status).toBe('stale')
    expect(health.error).toContain('stale')
  })

  it('should detect empty grounding data', () => {
    healthChecker.updateGroundingData([], [])

    // Mock the logger to avoid issues in test
    const mockLogger = {
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }

    const health = healthChecker.checkGrounding(mockLogger as any)
    expect(health.status).toBe('unhealthy')
    expect(health.error).toContain('empty')
  })
})