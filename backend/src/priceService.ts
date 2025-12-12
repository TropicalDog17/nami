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

export class PriceService {
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
                // Example: for IDR we want how many USD is 1 IDR -> base=IDR symbols=USD
                if (asset.symbol.toUpperCase() === "USD") {
                    rateUSD = 1;
                    source = "FIXED";
                } else {
                    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(
                        asset.symbol.toUpperCase()
                    )}&symbols=USD`;
                    const res = await axios.get(url, { timeout: 8000 });
                    const v = res.data?.rates?.USD;
                    if (typeof v === "number" && isFinite(v) && v > 0) {
                        rateUSD = v;
                        source = "EXCHANGE_RATE_HOST";
                    }
                }
            } else {
                const id = cryptoIdForSymbol(asset.symbol);
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
                    id
                )}&vs_currencies=usd`;
                const res = await axios.get(url, { timeout: 8000 });
                const v = res.data?.[id]?.usd;
                if (typeof v === "number" && isFinite(v) && v > 0) {
                    rateUSD = v;
                    source = "COINGECKO";
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
