import { AppConfig } from './config.js'
import { createCorrelationLogger } from './logger.js'
import { getGrounding } from './backendClient.js'
import OpenAI from 'openai'

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  checks: {
    backend: {
      status: 'healthy' | 'unhealthy'
      latency?: number
      error?: string
    }
    openai: {
      status: 'healthy' | 'unhealthy'
      latency?: number
      error?: string
    }
    grounding: {
      status: 'healthy' | 'stale' | 'unhealthy'
      age?: number
      accounts?: number
      tags?: number
      error?: string
    }
    config: {
      status: 'healthy' | 'unhealthy'
      issues?: string[]
    }
  }
  summary: {
    total: number
    healthy: number
    degraded: number
    unhealthy: number
  }
}

export class HealthChecker {
  private startTime: number
  private groundingData: { accounts: any[]; tags: any[]; lastFetch: number } | null = null

  constructor(private cfg: AppConfig) {
    this.startTime = Date.now()
  }

  updateGroundingData(accounts: any[], tags: any[]): void {
    this.groundingData = {
      accounts: [...accounts],
      tags: [...tags],
      lastFetch: Date.now()
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const correlationLogger = createCorrelationLogger(`health-${Date.now()}`)
    const startTime = Date.now()

    correlationLogger.info({}, 'Starting comprehensive health check')

    const checks = {
      backend: await this.checkBackend(correlationLogger),
      openai: await this.checkOpenAI(correlationLogger),
      grounding: this.checkGrounding(correlationLogger),
      config: this.checkConfig(correlationLogger)
    }

    const summary = this.calculateSummary(checks)

    const result: HealthCheckResult = {
      status: this.determineOverallStatus(summary),
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      checks,
      summary
    }

    const duration = Date.now() - startTime
    correlationLogger.info({
      status: result.status,
      duration,
      healthy: summary.healthy,
      unhealthy: summary.unhealthy,
      degraded: summary.degraded
    }, 'Health check completed')

    return result
  }

  private async checkBackend(correlationLogger: any): Promise<HealthCheckResult['checks']['backend']> {
    const startTime = Date.now()
    try {
      // Test backend connectivity by checking accounts endpoint
      const response = await fetch(`${this.cfg.BACKEND_BASE_URL}/admin/accounts`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`)
      }

      const latency = Date.now() - startTime
      correlationLogger.debug({ latency, status: response.status }, 'Backend health check passed')

      return { status: 'healthy', latency }
    } catch (error: any) {
      correlationLogger.warn({ error: error.message }, 'Backend health check failed')
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }

  private async checkOpenAI(correlationLogger: any): Promise<HealthCheckResult['checks']['openai']> {
    const startTime = Date.now()
    try {
      const openai = new OpenAI({ apiKey: this.cfg.OPENAI_API_KEY })

      // Simple API call to test connectivity - using models endpoint as it's lightweight
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.cfg.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`OpenAI API returned ${response.status}`)
      }

      const latency = Date.now() - startTime
      correlationLogger.debug({ latency, status: response.status }, 'OpenAI health check passed')

      return { status: 'healthy', latency }
    } catch (error: any) {
      correlationLogger.warn({ error: error.message }, 'OpenAI health check failed')
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }

  private checkGrounding(correlationLogger: any): HealthCheckResult['checks']['grounding'] {
    if (!this.groundingData) {
      correlationLogger.warn({}, 'Grounding data not available')
      return {
        status: 'unhealthy',
        error: 'Grounding data not initialized'
      }
    }

    const age = Date.now() - this.groundingData.lastFetch
    const maxAge = 10 * 60 * 1000 // 10 minutes

    if (age > maxAge) {
      correlationLogger.warn({ age, maxAge }, 'Grounding data is stale')
      return {
        status: 'stale',
        age,
        accounts: this.groundingData.accounts.length,
        tags: this.groundingData.tags.length,
        error: 'Grounding data is stale'
      }
    }

    if (this.groundingData.accounts.length === 0 || this.groundingData.tags.length === 0) {
      correlationLogger.warn({
        accounts: this.groundingData.accounts.length,
        tags: this.groundingData.tags.length
      }, 'Grounding data is empty')
      return {
        status: 'unhealthy',
        age,
        accounts: this.groundingData.accounts.length,
        tags: this.groundingData.tags.length,
        error: 'Grounding data is empty'
      }
    }

    correlationLogger.debug({
      age,
      accounts: this.groundingData.accounts.length,
      tags: this.groundingData.tags.length
    }, 'Grounding health check passed')

    return {
      status: 'healthy',
      age,
      accounts: this.groundingData.accounts.length,
      tags: this.groundingData.tags.length
    }
  }

  private checkConfig(correlationLogger: any): HealthCheckResult['checks']['config'] {
    const issues: string[] = []

    // Check critical configuration
    if (!this.cfg.TELEGRAM_BOT_TOKEN || this.cfg.TELEGRAM_BOT_TOKEN.length < 10) {
      issues.push('Invalid or missing Telegram bot token')
    }

    if (!this.cfg.OPENAI_API_KEY || !this.cfg.OPENAI_API_KEY.startsWith('sk-')) {
      issues.push('Invalid or missing OpenAI API key')
    }

    if (!this.cfg.BACKEND_BASE_URL || !this.cfg.BACKEND_BASE_URL.startsWith('http')) {
      issues.push('Invalid or missing backend base URL')
    }

    if (!this.cfg.BACKEND_SIGNING_SECRET || this.cfg.BACKEND_SIGNING_SECRET.length < 16) {
      issues.push('Invalid or missing backend signing secret')
    }

    if (this.cfg.allowedChatIds.size === 0) {
      issues.push('No allowed chat IDs configured')
    }

    if (issues.length > 0) {
      correlationLogger.warn({ issues }, 'Configuration issues found')
      return {
        status: 'unhealthy',
        issues
      }
    }

    correlationLogger.debug({}, 'Configuration health check passed')
    return { status: 'healthy' }
  }

  private calculateSummary(checks: HealthCheckResult['checks']): HealthCheckResult['summary'] {
    const values = Object.values(checks)
    const healthy = values.filter(c => c.status === 'healthy').length
    const degraded = values.filter(c => c.status === 'stale').length
    const unhealthy = values.filter(c => c.status === 'unhealthy').length

    return {
      total: values.length,
      healthy,
      degraded,
      unhealthy
    }
  }

  private determineOverallStatus(summary: HealthCheckResult['summary']): 'healthy' | 'degraded' | 'unhealthy' {
    if (summary.unhealthy > 0) {
      return 'unhealthy'
    }
    if (summary.degraded > 0 || summary.healthy < summary.total) {
      return 'degraded'
    }
    return 'healthy'
  }
}