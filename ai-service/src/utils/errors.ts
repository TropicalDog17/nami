import { logger } from '../utils/logger.js'

export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  AI_SERVICE = 'ai_service',
  BACKEND = 'backend',
  TELEGRAM = 'telegram',
  CONFIGURATION = 'configuration',
  INTERNAL = 'internal'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class CategorizedError extends Error {
  public readonly category: ErrorCategory
  public readonly severity: ErrorSeverity
  public readonly context?: Record<string, unknown>
  public readonly cause?: Error
  public readonly retryable: boolean

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    contextOrOptions?: Record<string, unknown> | {
      context?: Record<string, unknown>
      cause?: Error
      retryable?: boolean
    }
  ) {
    super(message)
    this.name = 'CategorizedError'
    this.category = category
    this.severity = severity

    // Handle both old format (context only) and new format (options object)
    if (contextOrOptions) {
      if ('context' in contextOrOptions || 'cause' in contextOrOptions || 'retryable' in contextOrOptions) {
        const options = contextOrOptions as { context?: Record<string, unknown>; cause?: Error; retryable?: boolean }
        this.context = options.context
        this.cause = options.cause
        this.retryable = options.retryable ?? false
      } else {
        this.context = contextOrOptions as Record<string, unknown>
        this.cause = undefined
        this.retryable = false
      }
    } else {
      this.context = undefined
      this.cause = undefined
      this.retryable = false
    }
  }
}

export function handleAndLogError(
  error: unknown,
  context: Record<string, unknown>,
  operation: string
): CategorizedError {
  const categorizedError = categorizeError(error, context, operation)

  logger.error({
    operation,
    category: categorizedError.category,
    severity: categorizedError.severity,
    message: categorizedError.message,
    context: categorizedError.context,
    stack: categorizedError.stack,
    cause: categorizedError.cause?.message,
    retryable: categorizedError.retryable
  }, 'Operation failed')

  return categorizedError
}

function categorizeError(
  error: unknown,
  context: Record<string, unknown>,
  operation: string
): CategorizedError {
  if (error instanceof CategorizedError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  const originalError = error instanceof Error ? error : undefined

  // Network related errors
  if (message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('EAI_AGAIN') ||
      message.includes('fetch') ||
      message.includes('network')) {
    return new CategorizedError(
      `Network error in ${operation}: ${message}`,
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable: true
      }
    )
  }

  // OpenAI API errors
  if (message.includes('openai') ||
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('insufficient quota')) {
    const severity = message.includes('quota') ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM
    const retryable = !message.includes('quota')
    return new CategorizedError(
      `OpenAI API error in ${operation}: ${message}`,
      ErrorCategory.AI_SERVICE,
      severity,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable
      }
    )
  }

  // Backend API errors
  if (message.includes('backend') ||
      message.includes('Backend') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('signature')) {
    return new CategorizedError(
      `Backend API error in ${operation}: ${message}`,
      ErrorCategory.BACKEND,
      ErrorSeverity.HIGH,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable: false
      }
    )
  }

  // Telegram API errors
  if (message.includes('telegram') ||
      message.includes('Telegram') ||
      message.includes('bot token') ||
      message.includes('chat')) {
    return new CategorizedError(
      `Telegram API error in ${operation}: ${message}`,
      ErrorCategory.TELEGRAM,
      ErrorSeverity.MEDIUM,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable: false
      }
    )
  }

  // Validation errors
  if (message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('zod')) {
    return new CategorizedError(
      `Validation error in ${operation}: ${message}`,
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable: false
      }
    )
  }

  // Configuration errors
  if (message.includes('config') ||
      message.includes('environment') ||
      message.includes('missing') ||
      message.includes('required')) {
    return new CategorizedError(
      `Configuration error in ${operation}: ${message}`,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.CRITICAL,
      {
        context: { ...context, originalError: message },
        cause: originalError,
        retryable: false
      }
    )
  }

  // Default to internal error
  return new CategorizedError(
    `Internal error in ${operation}: ${message}`,
    ErrorCategory.INTERNAL,
    ErrorSeverity.HIGH,
    {
      context: { ...context, originalError: message },
      cause: originalError,
      retryable: false
    }
  )
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof CategorizedError) {
    return error.retryable
  }
  const categorized = categorizeError(error, {}, 'unknown')
  return categorized.retryable
}