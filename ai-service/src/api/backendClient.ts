import crypto from "crypto";
import { ActionRequest, PendingActionCreate, TagRef } from "../core/schemas.js";
import { AppConfig } from "../utils/config.js";
import { logger, createCorrelationLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { handleAndLogError, CategorizedError } from "../utils/errors.js";

function signBody(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export async function createPendingAction(
  cfg: AppConfig,
  payload: PendingActionCreate,
  correlationId?: string,
): Promise<{ id: string; duplicate?: boolean; message?: string }> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug(
        {
          payload: {
            ...payload,
            raw_input: payload.raw_input?.substring(0, 100),
          },
        },
        "Creating pending action",
      );

      const url = `${cfg.BACKEND_BASE_URL}/admin/pending-actions`;
      const body = JSON.stringify(payload);
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Signature": signature,
          "User-Agent": "nami-ai-service/1.0",
        },
        body,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      // Accept both 201 (created) and 200 (duplicate found)
      if (!res.ok && res.status !== 200) {
        const text = await res.text();
        const error = new Error(
          `Backend create pending failed: ${res.status} ${text}`,
        );
        throw handleAndLogError(
          error,
          {
            url,
            status: res.status,
            responseText: text.substring(0, 200),
            payload: {
              source: payload.source,
              hasAction: !!payload.action_json,
            },
          },
          "createPendingAction",
        );
      }

      const result = (await res.json()) as {
        id: string;
        duplicate?: boolean;
        message?: string;
      };

      if (result.duplicate) {
        correlationLogger.info(
          { id: result.id },
          "Duplicate pending action found",
        );
      } else {
        correlationLogger.info(
          { id: result.id },
          "Successfully created pending action",
        );
      }

      return result;
    },
    "createPendingAction",
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export async function getTags(
  cfg: AppConfig,
  correlationId?: string,
): Promise<TagRef[]> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug({}, "Fetching tags from backend");

      const tagsRes = await fetch(`${cfg.BACKEND_BASE_URL}/admin/tags`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!tagsRes.ok) {
        const error = new Error(`Failed to fetch tags: ${tagsRes.status}`);
        throw handleAndLogError(
          error,
          {
            tagsStatus: tagsRes.status,
            tagsOk: tagsRes.ok,
          },
          "getTags",
        );
      }

      const tags = (await tagsRes.json()) as Array<{ name: string }>;

      correlationLogger.info(
        { tagsCount: tags.length },
        "Successfully fetched tags",
      );
      return tags;
    },
    "getTags",
    {
      maxAttempts: 2,
      baseDelayMs: 500,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export function redact(input: string, max = 200): string {
  return input.length > max ? `${input.slice(0, max)}…` : input;
}

// Simplified AI endpoints - no need to know vault names

export interface SimpleExpenseRequest {
  vnd_amount: number;
  date: string;
  counterparty?: string;
  tag?: string;
  note?: string;
  source_ref?: string;
}

export interface SimpleIncomeRequest {
  vnd_amount: number;
  date: string;
  counterparty?: string;
  tag?: string;
  note?: string;
  source_ref?: string;
}

export interface SimpleCreditExpenseRequest extends SimpleExpenseRequest {
  credit_account?: string;
}

export interface SimpleCardPaymentRequest {
  vnd_amount: number;
  date: string;
  from_account?: string;
  to_credit_account?: string;
  note?: string;
  source_ref?: string;
}

export interface SimpleTransactionResult {
  ok: boolean;
  duplicate?: boolean;
  transaction_id: string;
  account_used: string;
  message?: string;
}

export async function recordExpenseVND(
  cfg: AppConfig,
  payload: SimpleExpenseRequest,
  correlationId?: string,
): Promise<SimpleTransactionResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug(
        { vnd_amount: payload.vnd_amount, date: payload.date },
        "Recording expense VND",
      );

      const url = `${cfg.BACKEND_BASE_URL}/ai/expense-vnd`;
      const body = JSON.stringify(payload);
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Signature": signature,
          "User-Agent": "nami-ai-service/1.0",
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text();
        const error = new Error(
          `Backend expense-vnd failed: ${res.status} ${text}`,
        );
        throw handleAndLogError(
          error,
          { url, status: res.status },
          "recordExpenseVND",
        );
      }

      const result = (await res.json()) as SimpleTransactionResult;
      correlationLogger.info({ id: result.transaction_id }, "Expense recorded");
      return result;
    },
    "recordExpenseVND",
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export async function recordIncomeVND(
  cfg: AppConfig,
  payload: SimpleIncomeRequest,
  correlationId?: string,
): Promise<SimpleTransactionResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug(
        { vnd_amount: payload.vnd_amount, date: payload.date },
        "Recording income VND",
      );

      const url = `${cfg.BACKEND_BASE_URL}/ai/income-vnd`;
      const body = JSON.stringify(payload);
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Signature": signature,
          "User-Agent": "nami-ai-service/1.0",
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text();
        const error = new Error(
          `Backend income-vnd failed: ${res.status} ${text}`,
        );
        throw handleAndLogError(
          error,
          { url, status: res.status },
          "recordIncomeVND",
        );
      }

      const result = (await res.json()) as SimpleTransactionResult;
      correlationLogger.info({ id: result.transaction_id }, "Income recorded");
      return result;
    },
    "recordIncomeVND",
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export async function recordCreditExpenseVND(
  cfg: AppConfig,
  payload: SimpleCreditExpenseRequest,
  correlationId?: string,
): Promise<SimpleTransactionResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug(
        { vnd_amount: payload.vnd_amount, date: payload.date },
        "Recording credit expense VND",
      );

      const url = `${cfg.BACKEND_BASE_URL}/ai/credit-expense-vnd`;
      const body = JSON.stringify(payload);
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Signature": signature,
          "User-Agent": "nami-ai-service/1.0",
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text();
        const error = new Error(
          `Backend credit-expense-vnd failed: ${res.status} ${text}`,
        );
        throw handleAndLogError(
          error,
          { url, status: res.status },
          "recordCreditExpenseVND",
        );
      }

      const result = (await res.json()) as SimpleTransactionResult;
      correlationLogger.info(
        { id: result.transaction_id },
        "Credit expense recorded",
      );
      return result;
    },
    "recordCreditExpenseVND",
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export async function recordCardPaymentVND(
  cfg: AppConfig,
  payload: SimpleCardPaymentRequest,
  correlationId?: string,
): Promise<SimpleTransactionResult> {
  const correlationLogger = createCorrelationLogger(correlationId);

  return withRetry(
    async () => {
      correlationLogger.debug(
        { vnd_amount: payload.vnd_amount, date: payload.date },
        "Recording card payment VND",
      );

      const url = `${cfg.BACKEND_BASE_URL}/ai/card-payment-vnd`;
      const body = JSON.stringify(payload);
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Signature": signature,
          "User-Agent": "nami-ai-service/1.0",
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text();
        const error = new Error(
          `Backend card-payment-vnd failed: ${res.status} ${text}`,
        );
        throw handleAndLogError(
          error,
          { url, status: res.status },
          "recordCardPaymentVND",
        );
      }

      const result = (await res.json()) as SimpleTransactionResult;
      correlationLogger.info(
        { id: result.transaction_id },
        "Card payment recorded",
      );
      return result;
    },
    "recordCardPaymentVND",
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "502",
        "503",
        "504",
      ],
    },
  );
}

export function toActionRequest(obj: unknown): ActionRequest | null {
  if (!obj || typeof obj !== "object") return null;
  try {
    const { action, params } = obj as any;
    if (!action || !params) return null;
    return { action, params } as ActionRequest;
  } catch (e) {
    logger.warn({ err: e }, "toActionRequest failed");
    return null;
  }
}
