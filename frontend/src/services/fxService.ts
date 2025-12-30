import { fxApi } from './api';

// FX Rate data structure
interface FXRate {
  date: string;
  rate: number;
  from: string;
  to: string;
}

interface FXCache {
  [key: string]: {
    rate: number;
    timestamp: number;
    expiry: number;
  };
}

// FX Service with caching
class FXRateService {
  private cache: FXCache = {};
  private pending: Map<string, Promise<number>> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly FALLBACK_USD_RATE = 1.0; // USD to USD is always 1
  private readonly FALLBACK_VND_RATE = 24000; // Conservative fallback rate

  // Treat common USD-pegged stablecoins as USD to avoid noisy requests
  private normalizeCurrency(sym: string): string {
    const s = sym.toUpperCase();
    const STABLE_TO_USD = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'USDP', 'DAI']);
    return STABLE_TO_USD.has(s) ? 'USD' : s;
  }

  // Generate cache key for FX rates
  private getCacheKey(from: string, to: string, date?: string): string {
    const dateKey = date ?? 'today';
    return `${from}-${to}-${dateKey}`;
  }

  // Check if cached rate is valid
  private isCacheValid(cacheEntry: { timestamp: number; expiry: number }): boolean {
    return Date.now() < cacheEntry.expiry;
  }

  // Store rate in cache
  private setCache(key: string, rate: number, ttlMs?: number): void {
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : this.CACHE_DURATION;
    this.cache[key] = {
      rate,
      timestamp: Date.now(),
      expiry: Date.now() + ttl,
    };
  }

  // Get rate from cache
  private getCache(key: string): number | null {
    const cached = this.cache[key];
    if (cached && this.isCacheValid(cached)) {
      return cached.rate;
    }

    // Remove expired cache entry
    if (cached) {
      delete this.cache[key];
    }

    return null;
  }

  // Format date for API (YYYY-MM-DD)
  private formatDateForAPI(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Convert amount using FX rate (helper)
  private applyRate(
    amount: number,
    fxRate: number,
    _fromCurrency: string,
    _toCurrency: string
  ): number {
    return amount * fxRate;
  }

  // Get FX rate with caching and fallback. Deduplicates in-flight requests and caches fallbacks
  async getFXRate(
    from: string,
    to: string,
    date?: Date
  ): Promise<number> {
    // Normalize currencies (stablecoins -> USD)
    const fromUpper = this.normalizeCurrency(from);
    const toUpper = this.normalizeCurrency(to);

    // Same currency is always 1
    if (fromUpper === toUpper) {
      return 1.0;
    }

    const dateStr = date ? this.formatDateForAPI(date) : undefined;

    // Check cache first
    const cacheKey = this.getCacheKey(fromUpper, toUpper, dateStr);
    const cachedRate = this.getCache(cacheKey);
    if (cachedRate !== null) {
      return cachedRate;
    }

    // De-duplicate in-flight requests
    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey) as Promise<number>;
    }

    const fetchPromise = (async (): Promise<number> => {
      try {
        let rate: number;
        if (dateStr) {
          const response = await fxApi.getHistoricalRate(fromUpper, toUpper, dateStr) as Array<{ rate?: number; Rate?: number }>;
          if (response && Array.isArray(response) && response.length > 0) {
            rate = Number(response[0].rate ?? response[0].Rate);
          } else {
            throw new Error('Invalid historical rate response');
          }
        } else {
          const response = await fxApi.getTodayRate(fromUpper, toUpper) as { rate?: number; Rate?: number };
          rate = Number(response.rate ?? response.Rate);
        }

        if (!rate || rate <= 0) throw new Error('Invalid rate received');
        this.setCache(cacheKey, rate);
        return rate;
      } catch {
        // Compute deterministic fallback and cache it to prevent spamming
        let fallback = 1.0;
        if (fromUpper === 'USD' && toUpper === 'VND') fallback = this.FALLBACK_VND_RATE;
        else if (fromUpper === 'VND' && toUpper === 'USD') fallback = 1 / this.FALLBACK_VND_RATE;
        else if (toUpper === 'VND') fallback = this.FALLBACK_VND_RATE; // generic best-effort
        else fallback = 1.0;
        // Cache fallback briefly to avoid burst retries
        this.setCache(cacheKey, fallback, 30 * 1000); // 30s TTL for fallbacks so we re-try quickly for real price
        return fallback;
      } finally {
        this.pending.delete(cacheKey);
      }
    })();

    this.pending.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  // Convert amount from one currency to another
  async convertAmount(
    amount: number,
    from: string,
    to: string,
    date?: Date
  ): Promise<number> {
    try {
      const fxRate = await this.getFXRate(from, to, date);
      return this.applyRate(amount, fxRate, from, to);
    } catch (error) {
      console.error(`Currency conversion failed ${amount} ${from} to ${to}:`, error);

      // For critical errors, return 0 to prevent UI crashes
      return 0;
    }
  }

  // Batch convert multiple amounts (more efficient)
  async batchConvert(
    amounts: Array<{
      amount: number;
      from: string;
      to: string;
      date?: Date;
    }>
  ): Promise<Array<{ amount: number; rate: number; success: boolean }>> {
    const results: Array<{ amount: number; rate: number; success: boolean }> = [];
    const ratePromises = new Map<string, Promise<number>>();

    // First, prepare rate requests (deduplicate same currency pairs/dates)
    for (const item of amounts) {
      const from = item.from.toUpperCase();
      const to = item.to.toUpperCase();
      const dateKey = item.date ? this.formatDateForAPI(item.date) : 'today';
      const cacheKey = this.getCacheKey(from, to, dateKey);

      // Check cache first; if not cached, queue a fetch
      const cachedRate = this.getCache(cacheKey);
      if (cachedRate === null) {
        const requestKey = `${from}-${to}-${dateKey}`;
        if (!ratePromises.has(requestKey)) {
          ratePromises.set(requestKey, this.getFXRate(from, to, item.date));
        }
      }
    }

    // Execute rate fetches in parallel
    const rateResults = await Promise.allSettled(Array.from(ratePromises.values()));

    // Process results and match back to original amounts
    let rateIndex = 0;
    for (const item of amounts) {
      const from = item.from.toUpperCase();
      const to = item.to.toUpperCase();
      const dateKey = item.date ? this.formatDateForAPI(item.date) : 'today';
      const cacheKey = this.getCacheKey(from, to, dateKey);

      // Check cache again (might have been populated by another request above)
      const cachedRate = this.getCache(cacheKey);
      if (cachedRate !== null) {
        results.push({
          amount: this.applyRate(item.amount, cachedRate, from, to),
          rate: cachedRate,
          success: true,
        });
      } else if (rateIndex < rateResults.length) {
        const result = rateResults[rateIndex];
        if (result.status === 'fulfilled') {
          const rate = result.value;
          this.setCache(cacheKey, rate);
          results.push({
            amount: this.applyRate(item.amount, rate, from, to),
            rate,
            success: true,
          });
        } else {
          results.push({
            amount: 0,
            rate: 0,
            success: false,
          });
        }
        rateIndex++;
      } else {
        results.push({
          amount: 0,
          rate: 0,
          success: false,
        });
      }
    }

    return results;
  }

  // Clear cache (useful for testing or force refresh)
  clearCache(): void {
    this.cache = {};
  }

  // Get cache stats for debugging
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache),
    };
  }
}

// Export singleton instance
export const fxService = new FXRateService();

// Export type for external use
export type { FXRate };