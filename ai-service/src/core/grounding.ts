import { AppConfig } from '../utils/config.js'
import { AccountRef, TagRef } from '../core/schemas.js'
import { getGrounding } from '../api/backendClient.js'
import { logger, createCorrelationLogger } from '../utils/logger.js'
import { handleAndLogError, ErrorCategory, ErrorSeverity } from '../utils/errors.js'

export interface GroundingProvider {
  get(): Promise<{ accounts: AccountRef[]; tags: TagRef[] }>
}

export function startGroundingCache(cfg: AppConfig, intervalMs = 5 * 60 * 1000): GroundingProvider {
  let accounts: AccountRef[] = []
  let tags: TagRef[] = []
  let lastFetch = 0
  let isRefreshing = false
  let consecutiveErrors = 0

  const correlationLogger = createCorrelationLogger()

  const refresh = async () => {
    if (isRefreshing) {
      correlationLogger.debug({}, 'Grounding refresh already in progress, skipping')
      return
    }

    isRefreshing = true
    const refreshId = `refresh-${Date.now()}`
    const refreshLogger = correlationLogger.child({ operation: refreshId })

    try {
      refreshLogger.debug({}, 'Starting grounding refresh')
      const data = await getGrounding(cfg, refreshId)
      accounts = data.accounts
      tags = data.tags
      lastFetch = Date.now()
      consecutiveErrors = 0
      refreshLogger.info({ accounts: accounts.length, tags: tags.length }, 'Grounding refreshed successfully')
    } catch (e: any) {
      consecutiveErrors++
      const categorizedError = handleAndLogError(
        e,
        {
          intervalMs,
          consecutiveErrors,
          lastFetch,
          staleFor: Date.now() - lastFetch
        },
        'groundingRefresh'
      )

      // If we have too many consecutive errors, escalate severity
      if (consecutiveErrors >= 3) {
        logger.error(
          {
            consecutiveErrors,
            lastFetch,
            errorCategory: categorizedError.category,
            errorMessage: categorizedError.message
          },
          'Multiple consecutive grounding refresh failures - service may be degraded'
        )
      }
    } finally {
      isRefreshing = false
    }
  }

  // Initial fetch
  refresh().catch(err => {
    logger.error({ err }, 'Initial grounding fetch failed')
  })

  // Periodic refresh
  const interval = setInterval(refresh, intervalMs)
  interval.unref()

  return {
    async get() {
      const ageMs = Date.now() - lastFetch
      const isStale = ageMs > intervalMs * 2

      if (isStale && !isRefreshing) {
        correlationLogger.warn({ ageMs, intervalMs }, 'Grounding data is stale, triggering refresh')
        // Don't await here to avoid blocking the caller
        refresh().catch(err => {
          correlationLogger.error({ err }, 'Background refresh failed')
        })
      }

      if (accounts.length === 0 || tags.length === 0) {
        correlationLogger.warn(
          { accountsCount: accounts.length, tagsCount: tags.length, ageMs },
          'Returning empty grounding data - service may be degraded'
        )
      }

      return { accounts, tags }
    }
  }
}


