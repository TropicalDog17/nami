import axios from "axios";
import { Asset, Rate, assetKey } from "./types";

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
    private async fetchFiatUsdRate(sym: string): Promise<{ rate: number; source: Rate["source"] } | null> {
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

    async getRateUSD(asset: Asset, atISO?: string): Promise<Rate> {
        const useFixed = process.env.NO_EXTERNAL_RATES === "1";
        const at = atISO ? new Date(atISO) : new Date();
        const key = `${assetKey(asset)}:${toMinuteISO(new Date(at))}`;
        const cached = cache.get(key);
        if (cached) return cached;

        let rateUSD = 1;
        let source: Rate["source"] = "FIXED";

        if (!useFixed) {
            if (asset.type === "FIAT") {
                // For FIAT, we want how many USD is 1 unit of FIAT -> base=FIAT symbols=USD
                if (asset.symbol.toUpperCase() === "USD") {
                    rateUSD = 1;
                    source = "FIXED";
                } else {
                    const sym = asset.symbol.toUpperCase();
                    const fallback = FIAT_FALLBACK_RATE_USD[sym];
                    const live = await this.fetchFiatUsdRate(sym);
                    if (live && typeof live.rate === "number") {
                        rateUSD = live.rate;
                        source = live.source;
                    } else if (typeof fallback === "number") {
                        rateUSD = fallback;
                        source = "FALLBACK";
                    }
                }
            } else {
                const id = cryptoIdForSymbol(asset.symbol);
                try {
                    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
                    const res = await axios.get(url, { timeout: 8000 });
                    const v = res.data?.[id]?.usd;
                    if (typeof v === "number" && isFinite(v) && v > 0) {
                        rateUSD = v;
                        source = "COINGECKO";
                    }
                } catch {
                    // leave default of 1 for unknown crypto if provider fails
                }
            }
        } else {
            // NO_EXTERNAL_RATES mode: prefer curated fallbacks for FIAT
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
