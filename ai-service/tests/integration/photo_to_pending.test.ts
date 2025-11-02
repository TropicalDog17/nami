import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildBot } from '../../dist/telegram.js'
import { OpenAIMock } from '../helpers/openaiMock.js'
import { startMockBackend } from '../helpers/mockBackend.js'
import { AppConfig } from '../../src/config.js'

describe('AI Service integration - photo to pending', () => {
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
      { content: '```toon\nrows[2]{date,description,amount,sign,reference}:\n  2025-01-01,COFFEE,45000,debit,abc\n  2025-01-02,REFUND,-45000,credit,xyz\n```' }
    ]) as any
    const grounding = { get: async () => ({ accounts: [{ name: 'Bank' }], tags: [] }) }

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

  it('parses photo and posts pending with TOON table', async () => {
    const update = {
      update_id: 1001,
      message: {
        message_id: 11,
        date: 0,
        chat: { id: 1, type: 'private' },
        photo: [
          { file_id: 'small', file_unique_id: 'u1', width: 1, height: 1 },
          { file_id: 'big', file_unique_id: 'u2', width: 100, height: 100 }
        ],
        caption: 'Bank history'
      }
    }
    const res = await request(app).post('/telegram/webhook').send(update)
    expect(res.status).toBe(200)

    // backend should have received one item
    expect(backend.received.length).toBe(1)
    const body = backend.received[0].body
    expect(body.source).toBe('telegram_image')
    expect(body.toon_text).toContain('rows[')
    expect(body.action_json).toBeFalsy()
  })
})


