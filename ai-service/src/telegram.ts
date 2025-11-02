import { Telegraf, Context } from 'telegraf'
import OpenAI from 'openai'
import { AppConfig } from './config.js'
import { logger } from './logger.js'
import { createPendingAction, redact } from './backendClient.js'
import { parseExpenseText } from './parser.js'
import { parseBankScreenshot } from './vision.js'
import { PendingActionCreate } from './schemas.js'
import { GroundingProvider } from './grounding.js'

type Ctx = Context & { state: Record<string, unknown> }

interface SessionState {
  awaitingAccountForBatch?: string
}

const sessionStore = new Map<number, SessionState>()

export function buildBot(cfg: AppConfig, openai: OpenAI, grounding: GroundingProvider) {
  const bot = new Telegraf<Ctx>(cfg.TELEGRAM_BOT_TOKEN)
  const isDryRun = process.env.TELEGRAM_DRY_RUN === 'true'

  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id || '')
    if (!cfg.allowedChatIds.has(chatId)) {
      return
    }
    ctx.state = ctx.state || {}
    await next()
  })

  bot.start((ctx) => {
    if (!isDryRun) return ctx.reply('Nami AI ready. Send a text like "Lunch 120k at McDo from Bank today" or a bank screenshot.')
  })

  // Handle text messages
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const text = ctx.message?.text || ''
    const state = sessionStore.get(chatId) || {}

    // If waiting for account selection for a batch
    if (state.awaitingAccountForBatch) {
      const account = text.trim()
      // No-op here; for v1 we ask user to resend the image with account in text
      await ctx.reply(`Got account: ${account}. Please resend the screenshot with this account in the caption for now.`)
      sessionStore.delete(chatId)
      return
    }

    try {
      const { accounts, tags } = await grounding.get()
      const parsed = await parseExpenseText(openai, text, accounts, tags)
      const payload: PendingActionCreate = {
        source: 'telegram_text',
        raw_input: text,
        toon_text: parsed.toon,
        action_json: parsed.action || undefined,
        confidence: parsed.confidence
      }
      const res = await createPendingAction(cfg, payload)
      if (!isDryRun) await ctx.reply(`Parsed and queued for review. Pending ID: ${res.id}`)
    } catch (e: any) {
      logger.error({ err: e }, 'text parse failed')
      if (!isDryRun) await ctx.reply(`Sorry, I couldn't parse that. ${redact(String(e.message || e))}`)
    }
  })

  // Handle photos with optional caption
  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const photos = ctx.message?.photo
    if (!photos || photos.length === 0) return
    const best = photos[photos.length - 1]
    const fileUrl = isDryRun
      ? 'https://example.com/fake.jpg'
      : (() => {
          /* eslint-disable no-useless-return */
          return '' as any
        })()
    let finalFileUrl = fileUrl
    if (!isDryRun) {
      const file = await ctx.telegram.getFile(best.file_id)
      finalFileUrl = `https://api.telegram.org/file/bot${cfg.TELEGRAM_BOT_TOKEN}/${file.file_path}`
    }
    const caption = ctx.message?.caption || ''
    try {
      const { toon, rows } = await parseBankScreenshot(openai, finalFileUrl)
      // For v1 we do not map into actions yet; store rows TOON as raw for review
      const payload: PendingActionCreate = {
        source: 'telegram_image',
        raw_input: caption || '[image] bank screenshot',
        toon_text: toon,
        meta: { telegram_file_id: best.file_id }
      }
      const res = await createPendingAction(cfg, payload)
      if (!isDryRun) await ctx.reply(`Screenshot parsed and queued (${rows.length} rows). Pending ID: ${res.id}`)
    } catch (e: any) {
      logger.error({ err: e }, 'vision parse failed')
      if (!isDryRun) await ctx.reply(`Sorry, I couldn't parse the screenshot. ${redact(String(e.message || e))}`)
    }
  })

  return bot
}


