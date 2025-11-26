import { Telegraf, Context } from 'telegraf'
import OpenAI from 'openai'
import { LLMClient } from './llm.js'
import { AppConfig } from '../utils/config.js'
import { logger, createCorrelationLogger } from '../utils/logger.js'
import { createPendingAction, redact } from '../api/backendClient.js'
import { parseExpenseText } from '../core/parser.js'
import { parseBankScreenshot } from './vision.js'
import { PendingActionCreate } from '../core/schemas.js'
import { GroundingProvider } from '../core/grounding.js'
import { handleAndLogError, ErrorCategory } from '../utils/errors.js'

type Ctx = Context & { state: Record<string, unknown> }

interface SessionState {
  awaitingAccountForBatch?: string
}

const sessionStore = new Map<number, SessionState>()

export function buildBot(cfg: AppConfig, openai: OpenAI, grounding: GroundingProvider) {
  const bot = new Telegraf<Ctx>(cfg.TELEGRAM_BOT_TOKEN)

   bot.telegram.setMyCommands([
    {
      command: 'start',
      description: 'Show how to send expenses or bank screenshots'
    },
    {
      command: 'grounding',
      description: 'Display cached accounts/tags counts'
    }
  ]).catch((err) => {
    logger.warn({ err }, 'Failed to register Telegram bot commands')
  })

  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id || '')
    console.log('chatId', chatId)
    if (!cfg.allowedChatIds.has(chatId)) {
      return
    }
    ctx.state = ctx.state || {}
    await next()
  })

  bot.command('grounding', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const correlationId = `cmd-grounding-${chatId}-${Date.now()}`
    const correlationLogger = createCorrelationLogger(correlationId)

    correlationLogger.info({ chatId }, 'Handling /grounding command')

    try {
      const { accounts, tags } = await grounding.get()
      await ctx.reply(
        `📚 Grounding cache\nAccounts: ${accounts.length}\nTags: ${tags.length}`
      )
    } catch (e: any) {
      correlationLogger.error({ err: e.message }, 'Failed to load grounding data')
    }
  })

  // Handle text messages
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const text = ctx.message?.text || ''
    const correlationId = `text-${chatId}-${Date.now()}`
    const correlationLogger = createCorrelationLogger(correlationId)
    const state = sessionStore.get(chatId) || {}

    correlationLogger.info({
      chatId,
      textLength: text.length,
      textPreview: text.substring(0, 100)
    }, 'Processing text message')

    // If waiting for account selection for a batch
    if (state.awaitingAccountForBatch) {
      const account = text.trim()
      correlationLogger.info({ requestedAccount: account }, 'Handling account selection for batch')
      // No-op here; for v1 we ask user to resend the image with account in text
      await ctx.reply(`Got account: ${account}. Please resend the screenshot with this account in the caption for now.`)
      sessionStore.delete(chatId)
      return
    }

    try {
      const { accounts, tags } = await grounding.get()
      correlationLogger.debug({
        accountsCount: accounts.length,
        tagsCount: tags.length
      }, 'Retrieved grounding data')

      // LLM provider and credentials are resolved from env/config via LLMClient
      const llmClient = new LLMClient(
        {
          provider: cfg.MODEL_PROVIDER,
          timeout: 30000,
        },
        correlationId
      )

      const parsed = await parseExpenseText(llmClient, text, accounts, tags, correlationId)

      const payload: PendingActionCreate = {
        source: 'telegram_text',
        raw_input: text,
        toon_text: parsed.toon,
        action_json: parsed.action || undefined,
        confidence: parsed.confidence
      }

      const res = await createPendingAction(cfg, payload, correlationId)

      correlationLogger.info(
        {
          pendingId: res.id,
          hasAction: !!parsed.action,
          actionType: parsed.action?.action,
          account: parsed.action?.params.account,
        },
        'Successfully processed text message'
      )
    } catch (e: any) {
      const categorizedError = handleAndLogError(
        e,
        {
          chatId,
          textLength: text.length,
          textPreview: text.substring(0, 100),
        },
        'parseText'
      )

      let userMessage = 'Sorry, I couldn\'t parse that text.'

      if (categorizedError.category === ErrorCategory.AI_SERVICE) {
        userMessage += ' The AI service is currently unavailable. Please try again later.'
      } else if (categorizedError.category === ErrorCategory.NETWORK) {
        userMessage += ' Network error occurred. Please check your connection and try again.'
      } else if (categorizedError.category === ErrorCategory.VALIDATION) {
        userMessage +=
          ' Please check the format and try again. Example: "Lunch 120k at McDo from Bank today"'
      } else {
        userMessage += ` ${redact(String(categorizedError.message))}`
      }

      await ctx.reply(userMessage)
    }
  })

  // Handle photos with optional caption
  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return
    const photos = ctx.message?.photo
    if (!photos || photos.length === 0) return
    const best = photos[photos.length - 1]
    const correlationId = `photo-${chatId}-${Date.now()}`
    const correlationLogger = createCorrelationLogger(correlationId)

    correlationLogger.info({
      chatId,
      fileId: best.file_id,
      hasCaption: !!ctx.message?.caption,
      photoCount: photos.length
    }, 'Processing photo message')

    try {
      // Get file info from Telegram
      const file = await ctx.telegram.getFile(best.file_id)
      if (!file.file_path) {
        throw new Error('Telegram file path is missing')
      }
      const finalFileUrl = `https://api.telegram.org/file/bot${cfg.TELEGRAM_BOT_TOKEN}/${file.file_path}`
      correlationLogger.debug({ filePath: file.file_path }, 'Constructed file URL from Telegram')

      const caption = ctx.message?.caption || ''
      correlationLogger.debug({ captionLength: caption.length }, 'Parsing bank screenshot')

      // Text LLM for any caption/auxiliary parsing (provider resolved from env/config)
      const llmClient = new LLMClient(
        {
          provider: cfg.MODEL_PROVIDER,
          timeout: 60000,
        },
        correlationId
      )

      // For vision, we still need to use OpenAI directly for now
      const { toon, rows } = await parseBankScreenshot(openai, finalFileUrl, correlationId)

      correlationLogger.info({
        rowsFound: rows.length,
        toonLength: toon.length,
        caption: caption.substring(0, 100)
      }, 'Successfully parsed screenshot')

      // For v1 we do not map into actions yet; store rows TOON as raw for review
      const payload: PendingActionCreate = {
        source: 'telegram_image',
        raw_input: caption || '[image] bank screenshot',
        toon_text: toon,
        meta: {
          telegram_file_id: best.file_id,
          rows_count: rows.length,
          file_size: best.file_size,
          width: best.width,
          height: best.height
        }
      }

      const res = await createPendingAction(cfg, payload, correlationId)

      correlationLogger.info({
        pendingId: res.id,
        rowsCount: rows.length
      }, 'Successfully created pending action from screenshot')

      const replyText = `📸 Screenshot parsed and queued (${rows.length} rows)\nPending ID: ${res.id}`
      await ctx.reply(replyText)
    } catch (e: any) {
      const categorizedError = handleAndLogError(
        e,
        {
          chatId,
          fileId: best.file_id,
          hasCaption: !!ctx.message?.caption
        },
        'parsePhoto'
      )

      let userMessage = 'Sorry, I couldn\'t parse the screenshot.'

      if (categorizedError.category === ErrorCategory.AI_SERVICE) {
        userMessage += ' The AI service is currently unavailable. Please try again later.'
      } else if (categorizedError.category === ErrorCategory.NETWORK) {
        userMessage += ' Network error occurred. Please check your connection and try again.'
      } else {
        userMessage += ` ${redact(String(categorizedError.message))}`
      }

      await ctx.reply(userMessage)
    }
  })

  return bot
}


