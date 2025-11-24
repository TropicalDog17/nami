import express from 'express'
import OpenAI from 'openai'
import { loadConfig } from './utils/config.js'
import { logger, createCorrelationLogger } from './utils/logger.js'
import { buildBot } from './integrations/telegram.js'
import { startGroundingCache } from './core/grounding.js'
import { HealthChecker } from './api/health.js'
import { apiTestRouter } from './api/api-test.js'
import { handleAndLogError, ErrorCategory, ErrorSeverity } from './utils/errors.js'

function validateConfig(cfg: any): void {
  const correlationLogger = createCorrelationLogger('startup')
  const errors: string[] = []

  // Critical configuration validation
  if (!cfg.TELEGRAM_BOT_TOKEN || cfg.TELEGRAM_BOT_TOKEN.length < 20) {
    errors.push('TELEGRAM_BOT_TOKEN is required and must be valid')
  }

  if (!cfg.OPENAI_API_KEY || !cfg.OPENAI_API_KEY.startsWith('sk-') || cfg.OPENAI_API_KEY.length < 20) {
    errors.push('OPENAI_API_KEY is required and must be valid')
  }

  if (!cfg.BACKEND_BASE_URL || !cfg.BACKEND_BASE_URL.startsWith('http')) {
    errors.push('BACKEND_BASE_URL is required and must be a valid URL')
  }

  if (!cfg.BACKEND_SIGNING_SECRET || cfg.BACKEND_SIGNING_SECRET.length < 16) {
    errors.push('BACKEND_SIGNING_SECRET is required and must be at least 16 characters')
  }

  if (!cfg.SERVICE_BASE_URL || !cfg.SERVICE_BASE_URL.startsWith('http')) {
    errors.push('SERVICE_BASE_URL is required and must be a valid URL')
  }

  if (cfg.PORT < 1 || cfg.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535')
  }

  if (cfg.allowedChatIds.size === 0) {
    errors.push('ALLOWED_CHAT_IDS must contain at least one chat ID')
  }

  if (errors.length > 0) {
    const error = new Error(`Configuration validation failed: ${errors.join(', ')}`)
    handleAndLogError(
      error,
      { errors, config: { ...cfg, OPENAI_API_KEY: cfg.OPENAI_API_KEY ? '[REDACTED]' : undefined } },
      'validateConfig'
    )
    process.exit(1)
  }

  correlationLogger.info({
    port: cfg.PORT,
    allowedChats: cfg.allowedChatIds.size,
    hasTelegramToken: !!cfg.TELEGRAM_BOT_TOKEN,
    hasOpenAIKey: !!cfg.OPENAI_API_KEY,
    backendUrl: cfg.BACKEND_BASE_URL,
    timezone: cfg.DEFAULT_TIMEZONE
  }, 'Configuration validated successfully')
}

async function main() {
  const startupLogger = createCorrelationLogger('startup')

  try {
    startupLogger.info({}, 'Starting Nami AI Service...')

    // Load and validate configuration
    const cfg = loadConfig()
    validateConfig(cfg)

    const app = express()
    app.use(express.json({ limit: '2mb' }))

    // Initialize health checker
    const healthChecker = new HealthChecker(cfg)

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: cfg.OPENAI_API_KEY,
      timeout: 60000, // 60 seconds
      maxRetries: 3
    })

    // Initialize grounding cache
    const grounding = startGroundingCache(cfg)

    // Update health checker with initial grounding data when available
    setTimeout(async () => {
      try {
        const data = await grounding.get()
        healthChecker.updateGroundingData(data.accounts, data.tags)
      } catch (e: any) {
        startupLogger.warn({ err: e.message }, 'Failed to load initial grounding data for health checker')
      }
    }, 5000)

    // Build and initialize bot
    const bot = buildBot(cfg, openai, grounding)

    // Enhanced webhook endpoint with better error handling
    app.post('/telegram/webhook', (req, res) => {
      const webhookLogger = createCorrelationLogger(`webhook-${Date.now()}`)
      webhookLogger.debug({ updateId: req.body.update_id }, 'Received Telegram webhook')

      try {
        ;(bot.webhookCallback('/telegram/webhook') as any)(req, res)
      } catch (error: any) {
        webhookLogger.error({ err: error }, 'Webhook processing failed')
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal webhook error' })
        }
      }
    })

    // Comprehensive health check endpoint
    app.get('/healthz', async (req, res) => {
      try {
        const health = await healthChecker.checkHealth()
        const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503
        res.status(statusCode).json(health)
      } catch (error: any) {
        logger.error({ err: error }, 'Health check failed')
        res.status(500).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        })
      }
    })

    // Simple readiness probe
    app.get('/ready', (req, res) => {
      res.json({ ready: true, timestamp: new Date().toISOString() })
    })

    // Metrics endpoint (basic)
    app.get('/metrics', (req, res) => {
      const metrics = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
      res.json(metrics)
    })

    // API testing endpoints
    app.use('/api/test', apiTestRouter)

    // Start server
    const port = cfg.PORT
    app.listen(port, () => {
      startupLogger.info(
        { port, nodeEnv: process.env.NODE_ENV || 'development' },
        '🚀 Nami AI Service is listening'
      )
    })

    // Fallback to polling in dev/local
    if (process.env.TELEGRAM_WEBHOOK_MODE !== 'true') {
      bot.launch().then(() => {
        startupLogger.info({}, '📱 Telegram bot polling started')
      }).catch((e) => {
        const categorizedError = handleAndLogError(
          e,
          { webhookMode: false },
          'botLaunch'
        )

        if (categorizedError.category === ErrorCategory.TELEGRAM) {
          startupLogger.error({}, '❌ Failed to start Telegram bot - check bot token and network')
        } else {
          startupLogger.error({}, '❌ Failed to start Telegram bot')
        }
      })

      // Graceful shutdown
      const gracefulShutdown = (signal: string) => {
        startupLogger.info({ signal }, 'Gracefully shutting down...')
        bot.stop(signal)
        process.exit(0)
      }

      process.once('SIGINT', () => gracefulShutdown('SIGINT'))
      process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
    } else {
      startupLogger.info({}, '📡 Webhook mode enabled - bot will receive updates via webhook')
    }

    // Global error handlers
    process.on('uncaughtException', (error) => {
      handleAndLogError(error, {}, 'uncaughtException')
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      handleAndLogError(
        new Error(`Unhandled rejection at: ${promise}, reason: ${reason}`),
        { reason },
        'unhandledRejection'
      )
    })

  } catch (error: any) {
    const categorizedError = handleAndLogError(
      error,
      { phase: 'startup' },
      'serviceStartup'
    )

    if (categorizedError.severity === ErrorSeverity.CRITICAL) {
      startupLogger.error({}, '❌ Critical startup error - service cannot start')
    } else {
      startupLogger.error({}, '❌ Startup error occurred')
    }

    process.exit(1)
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error in main')
  process.exit(1)
})


