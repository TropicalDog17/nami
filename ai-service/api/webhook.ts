import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { loadConfig } from "../src/utils/config.js";
import { logger } from "../src/utils/logger.js";
import { buildBot } from "../src/integrations/telegram.js";

let bot: ReturnType<typeof buildBot> | null = null;

function getBot() {
  if (!bot) {
    const cfg = loadConfig();
    const openai = new OpenAI({
      apiKey: cfg.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 3,
    });
    bot = buildBot(cfg, openai);
  }
  return bot;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const telegramBot = getBot();

    // Handle the Telegram webhook update
    await telegramBot.handleUpdate(req.body);

    res.status(200).json({ ok: true });
  } catch (error: any) {
    logger.error({ err: error }, "Webhook handler error");
    res.status(500).json({ error: "Internal server error" });
  }
}
