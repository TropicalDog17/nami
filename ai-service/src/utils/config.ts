import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  BACKEND_BASE_URL: z.string().url(),
  BACKEND_SIGNING_SECRET: z.string().min(16),
  SERVICE_BASE_URL: z.string().url(),
  PORT: z.coerce.number().default(8088),
  ALLOWED_CHAT_IDS: z.string().default(""),
  ALLOWED_TOPIC_IDS: z.string().default(""),
  DEFAULT_TIMEZONE: z.string().default("Asia/Ho_Chi_Minh"),

  MODEL_PROVIDER: z.enum(["openai", "anthropic", "zai"]).default("openai"),

  // Basic Auth
  BASIC_AUTH_ENABLED: z.string().optional(),
  BASIC_AUTH_USERNAME: z.string().optional(),
  BASIC_AUTH_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  allowedChatIds: Set<string>;
  allowedTopicIds: Set<string>;
  basicAuthEnabled: boolean;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  const allowedChatIds = new Set(
    parsed.ALLOWED_CHAT_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const allowedTopicIds = new Set(
    parsed.ALLOWED_TOPIC_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const basicAuthEnabled =
    parsed.BASIC_AUTH_ENABLED === "true" || parsed.BASIC_AUTH_ENABLED === "1";
  return { ...parsed, allowedChatIds, allowedTopicIds, basicAuthEnabled };
}
