import express from 'express'
import OpenAI from 'openai'
import { loadConfig } from './config.js'
import { logger } from './logger.js'
import { buildBot } from './telegram.js'
import { startGroundingCache } from './grounding.js'

async function main() {
  const cfg = loadConfig()
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  const openai = new OpenAI({ apiKey: cfg.OPENAI_API_KEY })
  const grounding = startGroundingCache(cfg)
  const bot = buildBot(cfg, openai, grounding)

  // Webhook endpoint (optional). If not used, run polling.
  app.post('/telegram/webhook', (req, res) => {
    ;(bot.webhookCallback('/telegram/webhook') as any)(req, res)
  })

  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  const port = cfg.PORT
  app.listen(port, () => logger.info({ port }, 'AI service listening'))

  // Fallback to polling in dev/local
  if (process.env.TELEGRAM_WEBHOOK_MODE !== 'true') {
    bot.launch().then(() => logger.info('Telegram bot polling started')).catch((e) => logger.error({ err: e }, 'Bot launch failed'))
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  process.exit(1)
})


