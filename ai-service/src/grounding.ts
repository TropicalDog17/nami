import { AppConfig } from './config.js'
import { AccountRef, TagRef } from './schemas.js'
import { getGrounding } from './backendClient.js'
import { logger } from './logger.js'

export interface GroundingProvider {
  get(): Promise<{ accounts: AccountRef[]; tags: TagRef[] }>
}

export function startGroundingCache(cfg: AppConfig, intervalMs = 5 * 60 * 1000): GroundingProvider {
  let accounts: AccountRef[] = []
  let tags: TagRef[] = []
  let lastFetch = 0

  const refresh = async () => {
    try {
      const data = await getGrounding(cfg)
      accounts = data.accounts
      tags = data.tags
      lastFetch = Date.now()
      logger.info({ accounts: accounts.length, tags: tags.length }, 'Grounding refreshed')
    } catch (e) {
      logger.warn({ err: e }, 'Grounding refresh failed')
    }
  }

  // initial fetch
  refresh()
  // periodic refresh
  setInterval(refresh, intervalMs).unref()

  return {
    async get() {
      if (Date.now() - lastFetch > intervalMs * 2) await refresh()
      return { accounts, tags }
    }
  }
}


