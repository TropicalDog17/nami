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
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly FALLBACK_USD_RATE = 1.0; // USD to USD is always 1
  private readonly FALLBACK_VND_RATE = 24000; // Conservative fallback rate

  // Generate cache key for FX rates
  private getCacheKey(from: string, to: string, date?: string): string {
    const dateKey = date || 'today';
    return `${from}-${to}-${dateKey}`;
  }

  // Check if cached rate is valid
  private isCacheValid(cacheEntry: { timestamp: number; expiry: number }): boolean {
    return Date.now() < cacheEntry.expiry;
  }

  // Store rate in cache
  private setCache(key: string, rate: number): void {
    this.cache[key] = {
      rate,
      timestamp: Date.now(),
      expiry: Date.now() + this.CACHE_DURATION,
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

  // Get FX rate with caching and fallback
  async getFXRate(
    from: string,
    to: string,
    date?: Date
  ): Promise<number> {
    // Normalize currencies
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    // USD to USD is always 1
    if (fromUpper === toUpper) {
      return 1.0;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(fromUpper, toUpper, date ? this.formatDateForAPI(date) : undefined);
    const cachedRate = this.getCache(cacheKey);
    if (cachedRate !== null) {
      return cachedRate;
    }

    try {
      let rate: number;

      if (date) {
        // Get historical rate for specific date
        const dateStr = this.formatDateForAPI(date);
        const response = await fxApi.getHistoricalRate(fromUpper, toUpper, dateStr) as any;

        // Parse the API response based on backend structure
        if (response && Array.isArray(response) && response.length > 0) {
          rate = Number(response[0].rate || response[0].Rate);
        } else {
          throw new Error('Invalid historical rate response');
        }
      } else {
        // Get today's rate
        const response = await fxApi.getTodayRate(fromUpper, toUpper) as any;
        rate = Number(response.rate || response.Rate);
      }

      // Validate rate
      if (!rate || rate <= 0) {
        throw new Error('Invalid rate received');
      }

      // Cache the valid rate
      this.setCache(cacheKey, rate);
      return rate;

    } catch (error) {
      console.warn(`Failed to fetch FX rate ${fromUpper}-${toUpper}:`, error);

      // Return fallback rate
      if (fromUpper === 'USD' && toUpper === 'VND') {
        return this.FALLBACK_VND_RATE;
      }
      if (fromUpper === 'VND' && toUpper === 'USD') {
        return 1 / this.FALLBACK_VND_RATE;
      }
      if (fromUpper === 'USD') {
        return this.FALLBACK_USD_RATE;
      }

      throw new Error(`No FX rate available for ${fromUpper} to ${toUpper}`);
    }
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