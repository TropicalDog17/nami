import express from 'express'
import { LLMClient, LLMProvider } from './llm.js'
import { parseExpenseText } from './parser.js'
import { parseBankScreenshot } from './vision.js'
import { createCorrelationLogger } from './logger.js'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import OpenAI from 'openai'

const router = express.Router()

// Test request schemas
const TextParseRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
  accounts: z.array(z.object({
    name: z.string(),
    id: z.string().optional()
  })).default([]),
  tags: z.array(z.object({
    name: z.string(),
    id: z.string().optional()
  })).default([])
})

const VisionParseRequestSchema = z.object({
  imageUrl: z.string().url('Valid image URL is required'),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
  localeHint: z.string().default('vi-VN')
})

const LLMChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
  })).min(1, 'At least one message is required'),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().min(1).max(8000).default(1000)
})

// POST /api/test/text-parse
router.post('/text-parse', async (req, res) => {
  const correlationId = uuidv4()
  const logger = createCorrelationLogger(correlationId)

  try {
    const validated = TextParseRequestSchema.parse(req.body)
    logger.info({ provider: validated.provider }, 'Starting text parse test')

    const llmClient = new LLMClient({
      provider: validated.provider,
      apiKey: validated.apiKey,
      model: validated.model,
      timeout: 30000
    }, correlationId)

    const accounts = validated.accounts.map(a => ({ name: a.name, id: a.id || a.name }))
    const tags = validated.tags.map(t => ({ name: t.name, id: t.id || t.name }))

    const result = await parseExpenseText(
      llmClient,
      validated.message,
      accounts,
      tags,
      correlationId
    )

    logger.info({
      hasAction: !!result.action,
      provider: validated.provider,
      model: llmClient.getModel()
    }, 'Text parse test completed')

    res.json({
      success: true,
      correlationId,
      provider: validated.provider,
      model: llmClient.getModel(),
      result
    })

  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Text parse test failed')
    res.status(500).json({
      success: false,
      correlationId,
      error: error.message
    })
  }
})

// POST /api/test/vision-parse
router.post('/vision-parse', async (req, res) => {
  const correlationId = uuidv4()
  const logger = createCorrelationLogger(correlationId)

  try {
    const validated = VisionParseRequestSchema.parse(req.body)
    logger.info({ provider: validated.provider }, 'Starting vision parse test')

    const llmClient = new LLMClient({
      provider: validated.provider,
      apiKey: validated.apiKey,
      model: validated.model,
      timeout: 60000
    }, correlationId)

    // Note: vision.ts still uses OpenAI directly for now
    // This will need to be updated to use LLMClient abstraction
    if (validated.provider !== 'openai') {
      throw new Error('Vision parsing currently only supports OpenAI provider')
    }

    const openaiClient = new OpenAI({
      apiKey: validated.apiKey,
      timeout: 60000
    })

    const result = await parseBankScreenshot(
      openaiClient,
      validated.imageUrl,
      correlationId,
      validated.localeHint
    )

    logger.info({
      rowsCount: result.rows.length,
      provider: validated.provider
    }, 'Vision parse test completed')

    res.json({
      success: true,
      correlationId,
      provider: validated.provider,
      result
    })

  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Vision parse test failed')
    res.status(500).json({
      success: false,
      correlationId,
      error: error.message
    })
  }
})

// POST /api/test/llm-chat
router.post('/llm-chat', async (req, res) => {
  const correlationId = uuidv4()
  const logger = createCorrelationLogger(correlationId)

  try {
    const validated = LLMChatRequestSchema.parse(req.body)
    logger.info({ provider: validated.provider }, 'Starting LLM chat test')

    const llmClient = new LLMClient({
      provider: validated.provider,
      apiKey: validated.apiKey,
      model: validated.model,
      timeout: 30000
    }, correlationId)

    const response = await llmClient.chat(validated.messages, {
      temperature: validated.temperature,
      maxTokens: validated.maxTokens
    })

    logger.info({
      contentLength: response.content.length,
      provider: validated.provider,
      model: response.model
    }, 'LLM chat test completed')

    res.json({
      success: true,
      correlationId,
      provider: validated.provider,
      model: response.model,
      response: {
        content: response.content,
        usage: response.usage
      }
    })

  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'LLM chat test failed')
    res.status(500).json({
      success: false,
      correlationId,
      error: error.message
    })
  }
})

// GET /api/test/providers
router.get('/providers', (req, res) => {
  res.json({
    providers: [
      {
        name: 'openai',
        defaultModels: {
          text: 'gpt-4o-mini',
          vision: 'gpt-4o-mini'
        }
      },
      {
        name: 'anthropic',
        defaultModels: {
          text: 'claude-3-5-haiku-20241022',
          vision: 'claude-3-5-haiku-20241022' // Not yet supported
        }
      }
    ]
  })
})

// GET /api/test/health
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0-test'
  })
})

export { router as apiTestRouter }