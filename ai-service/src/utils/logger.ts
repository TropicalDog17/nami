import pino, { Logger } from 'pino'
import { randomUUID } from 'crypto'

export const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  base: {
    pid: process.pid,
    hostname: undefined,
    service: 'nami-ai-service'
  }
})

export const logger = baseLogger

export class CorrelationLogger {
  private correlationId: string
  private logger: Logger

  constructor(correlationId?: string) {
    this.correlationId = correlationId || randomUUID()
    this.logger = baseLogger.child({ correlationId: this.correlationId })
  }

  child(bindings: Record<string, unknown>): CorrelationLogger {
    const newLogger = new CorrelationLogger(this.correlationId)
    newLogger.logger = this.logger.child(bindings)
    return newLogger
  }

  get correlationIdValue(): string {
    return this.correlationId
  }

  info(obj: Record<string, unknown>, msg?: string, ...args: any[]): void {
    this.logger.info(obj, msg, ...args)
  }

  warn(obj: Record<string, unknown>, msg?: string, ...args: any[]): void {
    this.logger.warn(obj, msg, ...args)
  }

  error(obj: Record<string, unknown>, msg?: string, ...args: any[]): void {
    this.logger.error(obj, msg, ...args)
  }

  debug(obj: Record<string, unknown>, msg?: string, ...args: any[]): void {
    this.logger.debug(obj, msg, ...args)
  }
}

export function createCorrelationLogger(correlationId?: string): CorrelationLogger {
  return new CorrelationLogger(correlationId)
}


