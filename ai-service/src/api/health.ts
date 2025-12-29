import { AppConfig } from '../utils/config.js'
import { createCorrelationLogger } from '../utils/logger.js'
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

  constructor(private cfg: AppConfig) {
    this.startTime = Date.now()
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const correlationLogger = createCorrelationLogger(`health-${Date.now()}`)
    const startTime = Date.now()

    correlationLogger.info({}, 'Starting comprehensive health check')

    const checks = {
      backend: await this.checkBackend(correlationLogger),
      openai: await this.checkOpenAI(correlationLogger),
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
      // Test backend connectivity by checking pending actions endpoint
      const response = await fetch(`${this.cfg.BACKEND_BASE_URL}/admin/pending-actions`, {
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
    const unhealthy = values.filter(c => c.status === 'unhealthy').length

    return {
      total: values.length,
      healthy,
      degraded: 0,
      unhealthy
    }
  }

  private determineOverallStatus(summary: HealthCheckResult['summary']): 'healthy' | 'degraded' | 'unhealthy' {
    if (summary.unhealthy > 0) {
      return 'unhealthy'
    }
    if (summary.healthy < summary.total) {
      return 'degraded'
    }
    return 'healthy'
  }
}