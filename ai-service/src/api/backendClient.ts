import crypto from 'crypto'
import { ActionRequest, PendingActionCreate, AccountRef, TagRef } from '../core/schemas.js'
import { AppConfig } from '../utils/config.js'
import { logger, createCorrelationLogger } from '../utils/logger.js'
import { withRetry } from '../utils/retry.js'
import { handleAndLogError, CategorizedError } from '../utils/errors.js'

function signBody(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

export async function createPendingAction(
  cfg: AppConfig,
  payload: PendingActionCreate,
  correlationId?: string
): Promise<{ id: string }> {
  const correlationLogger = createCorrelationLogger(correlationId)

  return withRetry(
    async () => {
      correlationLogger.debug({ payload: { ...payload, raw_input: payload.raw_input?.substring(0, 100) } }, 'Creating pending action')

      const url = `${cfg.BACKEND_BASE_URL}/admin/pending-actions`
      const body = JSON.stringify(payload)
      const signature = signBody(cfg.BACKEND_SIGNING_SECRET, body)

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Signature': signature,
          'User-Agent': 'nami-ai-service/1.0'
        },
        body,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      })

      if (!res.ok) {
        const text = await res.text()
        const error = new Error(`Backend create pending failed: ${res.status} ${text}`)
        throw handleAndLogError(
          error,
          {
            url,
            status: res.status,
            responseText: text.substring(0, 200),
            payload: { source: payload.source, hasAction: !!payload.action_json }
          },
          'createPendingAction'
        )
      }

      const result = await res.json() as { id: string }
      correlationLogger.info({ id: result.id }, 'Successfully created pending action')
      return result
    },
    'createPendingAction',
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '502', '503', '504']
    }
  )
}

export async function getGrounding(
  cfg: AppConfig,
  correlationId?: string
): Promise<{ accounts: AccountRef[]; tags: TagRef[] }> {
  const correlationLogger = createCorrelationLogger(correlationId)

  return withRetry(
    async () => {
      correlationLogger.debug({}, 'Fetching grounding data from backend')

      const [accountsRes, tagsRes] = await Promise.all([
        fetch(`${cfg.BACKEND_BASE_URL}/admin/accounts`, {
          signal: AbortSignal.timeout(10000)
        }),
        fetch(`${cfg.BACKEND_BASE_URL}/admin/tags`, {
          signal: AbortSignal.timeout(10000)
        })
      ])

      if (!accountsRes.ok || !tagsRes.ok) {
        const error = new Error(`Failed to fetch grounding data: accounts=${accountsRes.status}, tags=${tagsRes.status}`)
        throw handleAndLogError(
          error,
          {
            accountsStatus: accountsRes.status,
            tagsStatus: tagsRes.status,
            accountsOk: accountsRes.ok,
            tagsOk: tagsRes.ok
          },
          'getGrounding'
        )
      }

      const accounts = (await accountsRes.json()) as Array<{ name: string }>
      const tags = (await tagsRes.json()) as Array<{ name: string }>

      correlationLogger.info({ accountsCount: accounts.length, tagsCount: tags.length }, 'Successfully fetched grounding data')
      return { accounts, tags }
    },
    'getGrounding',
    {
      maxAttempts: 2,
      baseDelayMs: 500,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '502', '503', '504']
    }
  )
}

export function redact(input: string, max = 200): string {
  return input.length > max ? `${input.slice(0, max)}…` : input
}

export function toActionRequest(obj: unknown): ActionRequest | null {
  if (!obj || typeof obj !== 'object') return null
  try {
    const { action, params } = obj as any
    if (!action || !params) return null
    return { action, params } as ActionRequest
  } catch (e) {
    logger.warn({ err: e }, 'toActionRequest failed')
    return null
  }
}


