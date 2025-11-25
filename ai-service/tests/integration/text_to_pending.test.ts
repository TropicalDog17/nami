import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildBot } from '../../src/integrations/telegram.js'
import { OpenAIMock } from '../helpers/openaiMock.js'
import { startMockBackend } from '../helpers/mockBackend.js'
import { AppConfig } from '../../src/utils/config.js'

// Mock the LLMClient at module level
vi.mock('../../src/integrations/llm.js', async () => {
  const actual = await vi.importActual('../../src/integrations/llm.js')
  return {
    ...actual,
    LLMClient: vi.fn().mockImplementation(() => ({
      chat: vi.fn().mockResolvedValue({
        content: '```toon\naction: spend_vnd\nparams:\n  account: Bank\n  vnd_amount: 120000\n  date: 2025-01-01\n  counterparty: McDo\n```',
        model: 'gpt-4o-mini'
      }),
      getProvider: () => 'openai',
      getModel: () => 'gpt-4o-mini'
    }))
  }
})

describe('AI Service integration - text to pending', () => {
  const secret = 'test-secret-1234567890'
  let backend: Awaited<ReturnType<typeof startMockBackend>>
  let app: express.Express

  beforeAll(async () => {
    process.env.TELEGRAM_DRY_RUN = 'true'
    backend = await startMockBackend(secret)
    const cfg: AppConfig = {
      TELEGRAM_BOT_TOKEN: 'dummy:token',
      OPENAI_API_KEY: 'sk-test',
      BACKEND_BASE_URL: backend.url,
      BACKEND_SIGNING_SECRET: secret,
      SERVICE_BASE_URL: 'http://localhost:8081',
      PORT: 8081,
      ALLOWED_CHAT_IDS: '1',
      DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',
      allowedChatIds: new Set(['1'])
    }

    const openai = new OpenAIMock([
      { content: '```toon\naction: spend_vnd\nparams:\n  account: Bank\n  vnd_amount: 120000\n  date: 2025-01-01\n  counterparty: McDo\n```' }
    ]) as any

    // Grounding cache with fixed data
    const grounding = {
      get: async () => ({ accounts: [{ name: 'Bank' }], tags: [{ name: 'food' }] })
    }

    const bot = buildBot(cfg, openai, grounding as any)
    ;(bot as any).botInfo = { id: 999, is_bot: true, first_name: 'Test', username: 'testbot' }
    ;(bot.telegram as any).callApi = async (method: string, _payload: any) => {
      if (method === 'sendMessage') return { message_id: 1 }
      if (method === 'getFile') return { file_path: 'photos/test.jpg' }
      if (method === 'getMe') return (bot as any).botInfo
      return {}
    }
    app = express()
    app.use(express.json())
    app.post('/telegram/webhook', bot.webhookCallback('/telegram/webhook') as any)
  })

  afterAll(async () => {
    await backend.close()
  })

  it('parses text and posts pending action with valid HMAC', async () => {
    const update = {
      update_id: 1000,
      message: { message_id: 10, date: 0, chat: { id: 1, type: 'private' }, text: 'Lunch 120k at McDo from Bank on 2025-01-01' }
    }
    const res = await request(app).post('/telegram/webhook').send(update)
    expect(res.status).toBe(200)

    // Wait a moment for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // backend should have received one item
    expect(backend.received.length).toBe(1)
    const body = backend.received[0].body
    expect(body.source).toBe('telegram_text')
    expect(body.action_json).toBeDefined()
    expect(body.action_json.action).toBe('spend_vnd')
    expect(body.action_json.params.account).toBe('Bank')
    expect(body.action_json.params.vnd_amount).toBe(120000)
  })
})


