import axios from "axios";
import { Asset, Rate, assetKey } from "../types";
import { config } from "../core/config";
import { priceCacheRepository } from "../repositories/price-cache.repository";
import { logger } from "../utils/logger";
import pLimit from "p-limit";
import { createAssetFromSymbol } from "../utils/asset.util";

const limit = pLimit(1); // 🔒 sequential requests to avoid rate limits

function toDayISO(date: Date): string {
    const d = new Date(date); // Don't mutate the original
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cryptoIdForSymbol(symbol: string): string {
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
        XAU: "pax-gold", // PAXG - gold-backed token for accurate gold price
    };
    return map[sym] || sym.toLowerCase();
}

const cache = new Map<string, Rate>();

export class PriceService {
    private async limitedGet<T>(
        url: string,
        timeout = 8000,
        retries = 5
    ): Promise<T> {
        return limit(async () => {
            let lastError: Error | null = null;
            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    // Add base delay between all requests to CoinGecko
                    if (url.includes("coingecko.com") && attempt === 0) {
                        await delay(1500); // 1.5s delay before each CoinGecko request
                    }
                    const res = await axios.get<T>(url, { timeout });
                    return res.data;
                } catch (err: any) {
                    lastError = err;
                    if (err.response?.status === 429) {
                        const waitTime = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s, 32s, 64s
                        logger.warn(
                            { url, attempt, waitTime },
                            "Rate limited, waiting before retry"
                        );
                        await delay(waitTime);
                    } else {
                        throw err;
                    }
                }
            }
            throw lastError;
        });
    }

    private async fetchFiatUsdRate(
        sym: string
    ): Promise<{ rate: number; source: Rate["source"] } | null> {
        const symbol = sym.toUpperCase();

        try {
            const data: any = await this.limitedGet(
                `https://api.exchangerate.host/latest?base=${symbol}&symbols=USD`
            );
            const v = data?.rates?.USD;
            if (v > 0) return { rate: v, source: "EXCHANGE_RATE_HOST" };
        } catch (err: any) {
            logger.debug(
                { symbol, error: err.message },
                "exchangerate.host failed"
            );
        }

        try {
            const data: any = await this.limitedGet(
                `https://api.frankfurter.app/latest?from=${symbol}&to=USD`
            );
            const v = data?.rates?.USD;
            if (v > 0) return { rate: v, source: "FRANKFURTER" };
        } catch (err: any) {
            logger.debug(
                { symbol, error: err.message },
                "frankfurter.app failed"
            );
        }

        try {
            const data: any = await this.limitedGet(
                `https://open.er-api.com/v6/latest/${symbol}`
            );
            const v = data?.rates?.USD;
            if (v > 0) return { rate: v, source: "ER_API" };
        } catch (err: any) {
            logger.debug({ symbol, error: err.message }, "er-api.com failed");
        }

        logger.warn({ symbol }, "All fiat rate sources failed");
        return null;
    }

    private async fetchHistoricalCryptoPrice(
        id: string,
        at: Date
    ): Promise<number | null> {
        try {
            const days =
                Math.ceil(
                    (Date.now() - at.getTime()) / (1000 * 60 * 60 * 24)
                ) || 1;

            if (days < 0 || days > 365) return null;

            const data: any = await this.limitedGet(
                `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
                10000
            );

            const prices = data?.prices;
            if (!Array.isArray(prices)) return null;

            const target = at.getTime();
            let closest = prices[0][1];
            let minDiff = Math.abs(prices[0][0] - target);

            for (const [ts, price] of prices) {
                const diff = Math.abs(ts - target);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = price;
                }
            }

            return closest > 0 ? closest : null;
        } catch (err: any) {
            logger.warn(
                { id, at: at.toISOString(), error: err.message },
                "Historical crypto price fetch failed"
            );
            return null;
        }
    }

    private async fetchHistoricalFiatPrice(
        symbol: string,
        at: Date
    ): Promise<{ rate: number; source: Rate["source"] } | null> {
        // VND is not supported by Frankfurter, use ExchangeRate-API current rate
        if (symbol.toUpperCase() === "VND") {
            const apiKey =
                config.exchangeRateApiKey || "ce0562d3379ec1b87fd2d324";
            try {
                const data: any = await this.limitedGet(
                    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
                );
                const vndRate = data?.conversion_rates?.VND;
                if (vndRate > 0) {
                    // VND rate is USD->VND, we need VND->USD
                    return { rate: 1 / vndRate, source: "EXCHANGE_RATE_API" };
                }
            } catch (err: any) {
                logger.warn(
                    { symbol, at: at.toISOString(), error: err.message },
                    "VND price fetch from ExchangeRate-API failed"
                );
            }
            return null;
        }

        try {
            const date = at.toISOString().split("T")[0];
            const data: any = await this.limitedGet(
                `https://api.frankfurter.app/${date}?from=${symbol}&to=USD`
            );
            const v = data?.rates?.USD;
            if (v > 0) return { rate: v, source: "FRANKFURTER" };
        } catch (err: any) {
            logger.warn(
                { symbol, at: at.toISOString(), error: err.message },
                "Historical fiat price fetch failed"
            );
        }
        return null;
    }

    async getRateUSD(asset: Asset, atISO?: string): Promise<Rate> {
        const at = atISO ? new Date(atISO) : new Date();
        const key = `${assetKey(asset)}:${toDayISO(new Date(at))}`;

        const cached =
            cache.get(key) ?? priceCacheRepository.getByCacheKey(key);
        if (cached) {
            cache.set(key, cached);
            return cached;
        }

        let rateUSD = 1;
        let source: Rate["source"] = "FIXED";

        if (!config.noExternalRates) {
            const isHistorical = !!atISO && at < new Date();

            if (asset.symbol === "USD") {
                rateUSD = 1;
            } else if (asset.type === "FIAT") {
                const res = isHistorical
                    ? await this.fetchHistoricalFiatPrice(asset.symbol, at)
                    : await this.fetchFiatUsdRate(asset.symbol);
                if (res) {
                    rateUSD = res.rate;
                    source = res.source;
                }
            } else {
                const id = cryptoIdForSymbol(asset.symbol);
                if (isHistorical) {
                    const v = await this.fetchHistoricalCryptoPrice(id, at);
                    if (v) {
                        rateUSD = v;
                        source = "COINGECKO";
                    }
                } else {
                    try {
                        const data: any = await this.limitedGet(
                            `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
                        );
                        const v = data?.[id]?.usd;
                        if (v > 0) {
                            rateUSD = v;
                            source = "COINGECKO";
                        }
                    } catch (err: any) {
                        logger.warn(
                            { id, error: err.message },
                            "Current crypto price fetch failed"
                        );
                    }
                }
            }
        }

        const rate: Rate = {
            asset,
            rateUSD,
            timestamp: toDayISO(at),
            source,
        };

        cache.set(key, rate);
        priceCacheRepository.save(rate, key);
        return rate;
    }

    async syncHistoricalPrices(days: number): Promise<void> {
        if (config.noExternalRates) return;

        const db = priceCacheRepository["db"];
        const assetRows = db
            .prepare(`SELECT symbol as asset_symbol FROM admin_assets`)
            .all();

        const assets: Asset[] = assetRows.map((r: any) =>
            createAssetFromSymbol(r.asset_symbol)
        );

        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);

        for (const asset of assets) {
            const existing = new Set(
                priceCacheRepository.getTimestampsForAsset(asset)
            );

            console.log(
                "Syncing historical prices for",
                assetKey(asset),
                "from",
                start.toISOString(),
                "to",
                end.toISOString(),
                "..."
            );

            const dates: Date[] = [];
            for (
                let d = new Date(start);
                d <= end;
                d.setDate(d.getDate() + 1)
            ) {
                const ts = toDayISO(new Date(d));
                if (!existing.has(ts)) dates.push(new Date(d));
            }

            // Process sequentially with delays to avoid rate limiting
            let successCount = 0;
            let failCount = 0;
            for (const date of dates) {
                try {
                    const rate = await this.getRateUSD(
                        asset,
                        date.toISOString()
                    );
                    if (rate.source !== "FIXED") {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (err: any) {
                    logger.warn(
                        {
                            asset: assetKey(asset),
                            date: date.toISOString(),
                            error: err.message,
                        },
                        "Failed to fetch historical price"
                    );
                    failCount++;
                }
                // Add delay between requests to respect rate limits
                await delay(5000);
            }

            logger.info(
                {
                    asset: assetKey(asset),
                    total: dates.length,
                    success: successCount,
                    failed: failCount,
                },
                "Historical prices synced"
            );
        }
    }
}

export const priceService = new PriceService();
