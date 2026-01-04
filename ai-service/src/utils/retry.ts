import { logger } from "../utils/logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: string[];
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    retryableErrors = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"],
  } = options;

  let lastError: Error;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const result = await operation();
      if (attempt > 1) {
        logger.info(
          { operation: operationName, attempt },
          "Operation succeeded after retry",
        );
      }
      return result;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable =
        retryableErrors.some(
          (pattern) =>
            lastError.message.includes(pattern) ||
            (lastError as any).cause?.code === pattern,
        ) ||
        (lastError.message.includes("429") &&
          lastError.message.includes("rate limit")) ||
        lastError.message.includes("503") ||
        lastError.message.includes("502") ||
        lastError.message.includes("504");

      if (!isRetryable || attempt >= maxAttempts) {
        logger.error(
          {
            operation: operationName,
            attempt,
            maxAttempts,
            error: lastError.message,
            retryable: isRetryable,
          },
          "Operation failed permanently",
        );
        throw lastError;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(backoffFactor, attempt - 1),
        maxDelayMs,
      );

      logger.warn(
        {
          operation: operationName,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: lastError.message,
        },
        "Operation failed, retrying...",
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
