import { z } from 'zod'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BACKEND_BASE_URL: z.string().url(),
  BACKEND_SIGNING_SECRET: z.string().min(16),
  SERVICE_BASE_URL: z.string().url(),
  PORT: z.coerce.number().default(8081),
  ALLOWED_CHAT_IDS: z.string().default(''),
  DEFAULT_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh')
})

export type AppConfig = z.infer<typeof envSchema> & {
  allowedChatIds: Set<string>
}

export function loadConfig(): AppConfig {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config()
  const parsed = envSchema.parse(process.env)
  const allowedChatIds = new Set(
    parsed.ALLOWED_CHAT_IDS
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return { ...parsed, allowedChatIds }
}


