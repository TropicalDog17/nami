import promClient from "prom-client";

export interface ServiceMetrics {
  telegramMessages: promClient.Counter<string>;
  llmRequests: promClient.Counter<string>;
  llmTokens: promClient.Counter<string>;
  backendRequests: promClient.Counter<string>;
  pendingActions: promClient.Counter<string>;
  bankStatements: promClient.Counter<string>;
  errors: promClient.Counter<string>;
}

export function createCustomMetrics(
  register: promClient.Registry,
): ServiceMetrics {
  return {
    telegramMessages: new promClient.Counter({
      name: "nami_ai_telegram_messages_total",
      help: "Total Telegram messages processed",
      labelNames: ["message_type", "status"] as const,
      registers: [register],
    }),

    llmRequests: new promClient.Counter({
      name: "nami_ai_llm_requests_total",
      help: "Total LLM API requests",
      labelNames: ["provider", "model", "status"] as const,
      registers: [register],
    }),

    llmTokens: new promClient.Counter({
      name: "nami_ai_llm_tokens_total",
      help: "Total LLM tokens used",
      labelNames: ["provider", "model", "type"] as const,
      registers: [register],
    }),

    backendRequests: new promClient.Counter({
      name: "nami_ai_backend_requests_total",
      help: "Total backend API requests",
      labelNames: ["endpoint", "status"] as const,
      registers: [register],
    }),

    pendingActions: new promClient.Counter({
      name: "nami_ai_pending_actions_total",
      help: "Total pending actions created",
      labelNames: ["source"] as const,
      registers: [register],
    }),

    bankStatements: new promClient.Counter({
      name: "nami_ai_bank_statements_total",
      help: "Total bank statements processed",
      labelNames: ["bank", "statement_type"] as const,
      registers: [register],
    }),

    errors: new promClient.Counter({
      name: "nami_ai_errors_total",
      help: "Total categorized errors",
      labelNames: ["category", "severity", "operation"] as const,
      registers: [register],
    }),
  };
}
