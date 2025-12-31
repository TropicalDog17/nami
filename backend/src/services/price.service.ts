import axios from "axios";
import { Asset, Rate, assetKey } from "../types";
import { config } from "../core/config";

function toMinuteISO(date: Date): string {
  date.setSeconds(0, 0);
  return date.toISOString();
}

function cryptoIdForSymbol(symbol: string): string {
  const sym = symbol.toUpperCase();
  const map: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    USDT: "tether",
    USDC: "usd-coin",
    BNB: "binancecoin",
    XRP: "ripple",
    ADA: "cardano",
    DOGE: "dogecoin",
    TRX: "tron",
    DOT: "polkadot",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
  };
  return map[sym] || sym.toLowerCase();
}

const cache = new Map<string, Rate>();

// Fallback spot rates for FIAT -> USD when external providers are unavailable
// Values are conservative approximations to prevent obviously-wrong $1.00 defaults
// Rate means: 1 unit of FIAT equals X USD
const FIAT_FALLBACK_RATE_USD: Record<string, number> = {
  // Vietnamese Dong ~ 1 USD ≈ 24,000 VND -> 1 VND ≈ 1/24000 USD
  VND: 1 / 24000,
};

export class PriceService {
  private async fetchFiatUsdRate(
    sym: string,
  ): Promise<{ rate: number; source: Rate["source"] } | null> {
    const symbol = sym.toUpperCase();
    // Provider 1: exchangerate.host
    try {
      const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(symbol)}&symbols=USD`;
      const res = await axios.get(url, { timeout: 8000 });
      const v = res.data?.rates?.USD;
      if (typeof v === "number" && isFinite(v) && v > 0) {
        return { rate: v, source: "EXCHANGE_RATE_HOST" };
      }
    } catch {}
    // Provider 2: frankfurter.app
    try {
      const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(symbol)}&to=USD`;
      const res = await axios.get(url, { timeout: 8000 });
      const v = res.data?.rates?.USD;
      if (typeof v === "number" && isFinite(v) && v > 0) {
        return { rate: v, source: "FRANKFURTER" as Rate["source"] };
      }
    } catch {}
    // Provider 3: open.er-api.com
    try {
      const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(symbol)}`;
      const res = await axios.get(url, { timeout: 8000 });
      const v = res.data?.rates?.USD;
      if (typeof v === "number" && isFinite(v) && v > 0) {
        return { rate: v, source: "ER_API" as Rate["source"] };
      }
    } catch {}
    return null;
  }

  private async fetchHistoricalCryptoPrice(id: string, at: Date): Promise<number | null> {
    try {
      const now = new Date();
      const daysDiff = (now.getTime() - at.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff < 0) {
        return null;
      }

      let interval: string;
      let days: number;

      if (daysDiff <= 1) {
        interval = "hourly";
        days = 1;
      } else if (daysDiff <= 90) {
        interval = "daily";
        days = Math.ceil(daysDiff);
      } else if (daysDiff <= 365) {
        interval = "daily";
        days = 365;
      } else {
        return null;
      }

      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
      const res = await axios.get(url, { timeout: 10000 });
      const prices = res.data?.prices;

      if (!Array.isArray(prices) || prices.length === 0) {
        return null;
      }

      const targetTime = at.getTime();
      let closestPrice = prices[0][1];
      let minDiff = Math.abs(prices[0][0] - targetTime);

      for (const [timestamp, price] of prices) {
        const diff = Math.abs(timestamp - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestPrice = price;
        }
      }

      return typeof closestPrice === "number" && isFinite(closestPrice) && closestPrice > 0 ? closestPrice : null;
    } catch {
      return null;
    }
  }

  private async fetchHistoricalFiatPrice(symbol: string, at: Date): Promise<{ rate: number; source: Rate["source"] } | null> {
    try {
      const dateStr = at.toISOString().split("T")[0];
      const url = `https://api.frankfurter.app/${encodeURIComponent(dateStr)}?from=${encodeURIComponent(symbol)}&to=USD`;
      const res = await axios.get(url, { timeout: 8000 });
      const v = res.data?.rates?.USD;
      if (typeof v === "number" && isFinite(v) && v > 0) {
        return { rate: v, source: "FRANKFURTER" as Rate["source"] };
      }
    } catch {}
    return null;
  }

  async getRateUSD(asset: Asset, atISO?: string): Promise<Rate> {
    const useFixed = config.noExternalRates;
    const at = atISO ? new Date(atISO) : new Date();
    const key = `${assetKey(asset)}:${toMinuteISO(new Date(at))}`;
    const cached = cache.get(key);
    if (cached) return cached;

    let rateUSD = 1;
    let source: Rate["source"] = "FIXED";

    if (!useFixed) {
      const isHistorical = atISO && new Date(atISO) < new Date();

      if (asset.type === "FIAT") {
        if (asset.symbol.toUpperCase() === "USD") {
          rateUSD = 1;
          source = "FIXED";
        } else {
          const sym = asset.symbol.toUpperCase();
          const fallback = FIAT_FALLBACK_RATE_USD[sym];
          
          if (isHistorical) {
            const historical = await this.fetchHistoricalFiatPrice(sym, at);
            if (historical) {
              rateUSD = historical.rate;
              source = historical.source;
            } else if (typeof fallback === "number") {
              rateUSD = fallback;
              source = "FALLBACK";
            }
          } else {
            const live = await this.fetchFiatUsdRate(sym);
            if (live && typeof live.rate === "number") {
              rateUSD = live.rate;
              source = live.source;
            } else if (typeof fallback === "number") {
              rateUSD = fallback;
              source = "FALLBACK";
            }
          }
        }
      } else {
        const id = cryptoIdForSymbol(asset.symbol);
        
        if (isHistorical) {
          const historical = await this.fetchHistoricalCryptoPrice(id, at);
          if (historical !== null) {
            rateUSD = historical;
            source = "COINGECKO";
          }
        } else {
          try {
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
            const res = await axios.get(url, { timeout: 8000 });
            const v = res.data?.[id]?.usd;
            if (typeof v === "number" && isFinite(v) && v > 0) {
              rateUSD = v;
              source = "COINGECKO";
            }
          } catch {
          }
        }
      }
    } else {
      if (asset.type === "FIAT") {
        if (asset.symbol.toUpperCase() === "USD") {
          rateUSD = 1;
          source = "FIXED";
        } else {
          const sym = asset.symbol.toUpperCase();
          const fallback = FIAT_FALLBACK_RATE_USD[sym];
          if (typeof fallback === "number") {
            rateUSD = fallback;
            source = "FALLBACK";
          }
        }
      }
    }

    const rate: Rate = {
      asset,
      rateUSD,
      timestamp: toMinuteISO(at),
      source,
    };
    cache.set(key, rate);
    return rate;
  }
}

export const priceService = new PriceService();
