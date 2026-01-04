import { LLMClient } from "../integrations/llm.js";
import { ActionRequest, ActionRequestSchema } from "../core/schemas.js";
import { createCorrelationLogger } from "../utils/logger.js";
import { handleAndLogError, ErrorCategory } from "../utils/errors.js";

export interface ParseTextResult {
  toon: string;
  action?: ActionRequest;
  confidence?: number;
}

export interface ParseTopicMessageResult {
  messages: Array<{
    text: string;
    action?: ActionRequest;
    confidence?: number;
  }>;
}

export async function parseExpenseText(
  llmClient: LLMClient,
  message: string,
  correlationId?: string,
): Promise<ParseTextResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  correlationLogger.debug(
    {
      messageLength: message.length,
      messagePreview: message.substring(0, 100),
      provider: llmClient.getProvider(),
    },
    "Starting text parsing",
  );

  const system = `You are a precise financial parser. Output ONLY a fenced code block labelled json with a single JSON object having keys action and params.`;
  const user = [
    "Extract a spend action from the message into JSON with 2-space indent.",
    "Rules:",
    "- action must be one of: spend_vnd, credit_spend_vnd",
    '- params: account (can be empty string ""), vnd_amount (number), date (YYYY-MM-DD), counterparty?, tag?, note?',
    '- account should be left as empty string "" - backend will assign via vault defaults',
    "- tag can be any relevant category (e.g., food, transport, shopping)",
    "- If date is explicitly mentioned in the message, use that date",
    "- If date is NOT mentioned, use today's date (format: YYYY-MM-DD)",
    "- Use unformatted numbers (no commas); Vietnamese k = thousand may appear",
    "",
    "Message:",
    message,
    "",
    "Output ONLY the JSON code block.",
  ].join("\n");

  const response = await llmClient.chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      temperature: 0.2,
      maxTokens: 1000,
    },
  );

  const content = response.content;

  if (!content.trim()) {
    throw new Error("Empty response from text parsing API");
  }

  const toon = extractCodeBlock(content) || content.trim();

  if (!toon.trim()) {
    correlationLogger.warn(
      { content: content.substring(0, 200) },
      "No JSON content found in text response",
    );
    return { toon: content, action: undefined, confidence: undefined };
  }

  correlationLogger.debug(
    {
      contentLength: content.length,
      toonLength: toon.length,
      hasCodeBlock: extractCodeBlock(content) !== null,
    },
    "Extracted TOON content from text response",
  );

  let action: ActionRequest | undefined;
  try {
    const decoded = JSON.parse(toon) as any;
    action = ActionRequestSchema.parse(decoded);

    // Hardcode date to today if not explicitly provided in the message
    const today = new Date().toISOString().split("T")[0];
    const lowerMessage = message.toLowerCase();

    // Check if message explicitly mentions a date
    const hasDateKeyword =
      /yesterday|tomorrow|today|\d{1,2}[-/]\d{1,2}(-\d{2,4})?|last\s+\w+|next\s+\w+/i.test(
        lowerMessage,
      );

    // If no date keyword mentioned and we have a parsed action, override with today
    if (action && !hasDateKeyword) {
      correlationLogger.info(
        {
          originalDate: action.params.date,
          hardcodedDate: today,
          reason: "no explicit date in message",
        },
        "Hardcoding date to today",
      );
      action.params.date = today;
    }

    // Additional validation - account can be empty string for vault-based assignment
    if (!action.params.vnd_amount || !action.params.date) {
      throw new Error("Missing required parameters in parsed action");
    }

    correlationLogger.info(
      {
        action: action.action,
        account: action.params.account,
        amount: action.params.vnd_amount,
        date: action.params.date,
        hasCounterparty: !!action.params.counterparty,
        hasTag: !!action.params.tag,
      },
      "Successfully parsed text to action",
    );
  } catch (e: any) {
    correlationLogger.warn(
      {
        error: e.message,
        json: toon.substring(0, 200),
      },
      "Failed to parse JSON to valid action",
    );
    action = undefined;
  }

  return { toon, action, confidence: undefined };
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:toon|json)\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

/**
 * Parse multiple expense messages from a topic feed.
 * This is useful when processing messages from a Telegram topic/channel where
 * multiple users might post expenses in a single batch.
 */
export async function parseTopicMessages(
  llmClient: LLMClient,
  messages: string[],
  correlationId?: string,
): Promise<ParseTopicMessageResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  correlationLogger.debug(
    {
      messageCount: messages.length,
      provider: llmClient.getProvider(),
    },
    "Starting topic messages parsing",
  );

  const results = await Promise.all(
    messages.map(async (message) => {
      try {
        const parsed = await parseExpenseText(
          llmClient,
          message,
          correlationId,
        );
        return {
          text: message,
          action: parsed.action,
          confidence: parsed.confidence,
        };
      } catch (e: any) {
        correlationLogger.warn(
          {
            error: e.message,
            messagePreview: message.substring(0, 100),
          },
          "Failed to parse individual topic message",
        );
        return {
          text: message,
          action: undefined,
          confidence: undefined,
        };
      }
    }),
  );

  const successCount = results.filter((r) => r.action).length;
  correlationLogger.info(
    {
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
    },
    "Completed topic messages parsing",
  );

  return { messages: results };
}
