import { Router } from "express";
import { priceService } from "../services/price.service";

export const pricesRouter = Router();

// Helpers
const CRYPTO_SET = new Set([
  "BTC",
  "ETH",
  "SOL",
  "USDT",
  "USDC",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "TRX",
  "DOT",
  "MATIC",
  "AVAX",
]);
function asAsset(symbolInput: string) {
  const symbol = String(symbolInput || "").toUpperCase();
  const isCrypto = CRYPTO_SET.has(symbol) || symbol.length > 3;
  return { type: isCrypto ? ("CRYPTO" as const) : ("FIAT" as const), symbol };
}
function dateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}
function atStartOfDayISO(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  const iso = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
  ).toISOString();
  return iso;
}

// Simple daily price endpoint to satisfy frontend AdminAssetsTab
// GET /api/prices/daily?symbol=BTC&currency=USD&start=YYYY-MM-DD&end=YYYY-MM-DD
pricesRouter.get("/prices/daily", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "").toUpperCase();
    const currency = String(req.query.currency || "USD").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "symbol required" });

    const asset = asAsset(symbol);
    const currencyAsset = asAsset(currency);

    const aRate = await priceService.getRateUSD(asset);
    const cRate = await priceService.getRateUSD(currencyAsset);

    // price of 1 symbol in target currency
    // aRate.rateUSD = 1 asset -> USD
    // cRate.rateUSD = 1 currencyAsset -> USD
    // To get asset -> currency: (asset->USD) / (currency->USD)
    const price = aRate.rateUSD / (cRate.rateUSD || 1);

    // Return an array with current day (frontend uses the first element)
    const today = dateOnly(new Date());
    res.json([{ date: today, price }]);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch price" });
  }
});

// FX endpoints used by frontend fxService
// GET /api/fx/today?from=USD&to=VND
pricesRouter.get("/fx/today", async (req, res) => {
  try {
    const from = String(req.query.from || "USD").toUpperCase();
    const to = String(req.query.to || "USD").toUpperCase();

    const fromAsset = asAsset(from);
    const toAsset = asAsset(to);

    // Same currency => rate 1
    if (fromAsset.symbol === toAsset.symbol) {
      return res.json({ from, to, rate: 1, date: dateOnly(new Date()) });
    }

    const fromRate = await priceService.getRateUSD(fromAsset);
    const toRate = await priceService.getRateUSD(toAsset);
    const rate = fromRate.rateUSD / (toRate.rateUSD || 1);

    res.json({ from, to, rate, date: dateOnly(new Date()) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch FX rate" });
  }
});

// GET /api/fx/history?from=USD&to=VND&start=YYYY-MM-DD&end=YYYY-MM-DD
pricesRouter.get("/fx/history", async (req, res) => {
  try {
    const from = String(req.query.from || "USD").toUpperCase();
    const to = String(req.query.to || "USD").toUpperCase();
    const startStr = String(req.query.start || "") || dateOnly(new Date());
    const endStr = String(req.query.end || "") || startStr;

    const fromAsset = asAsset(from);
    const toAsset = asAsset(to);

    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid start or end date" });
    }

    // Ensure start <= end
    if (start.getTime() > end.getTime()) {
      return res
        .status(400)
        .json({ error: "start must be before or equal to end" });
    }

    // Build inclusive list of dates (UTC days)
    const days: string[] = [];
    const iter = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const endUTC = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    while (iter.getTime() <= endUTC.getTime()) {
      days.push(dateOnly(iter));
      iter.setUTCDate(iter.getUTCDate() + 1);
    }

    // For each day, compute derived rate from asset->USD divided by to->USD
    const results = [] as Array<{
      date: string;
      rate: number;
      from: string;
      to: string;
    }>;
    for (const day of days) {
      const atISO = atStartOfDayISO(day);
      const fromRate = await priceService.getRateUSD(fromAsset, atISO);
      const toRate = await priceService.getRateUSD(toAsset, atISO);
      const rate = fromRate.rateUSD / (toRate.rateUSD || 1);
      results.push({ date: day, rate, from, to });
    }

    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch FX history" });
  }
});
