import { Asset } from "../types";

/**
 * Set of known crypto asset symbols.
 * This list should be kept in sync with the cryptoIdForSymbol mapping in price.service.ts
 */
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
  // Commodities fetched via tokenized crypto (PAXG, etc.)
  "XAU", // Gold via PAXG
  "GOLD", // Gold via PAXG
  "XAG", // Silver (using PAXG as fallback)
]);

/**
 * Determines if a symbol represents a crypto asset.
 *
 * Logic:
 * - If the symbol is in the known crypto set, it's crypto
 * - If the symbol has more than 3 characters, it's crypto (e.g., USDT, MATIC)
 * - Otherwise, it's assumed to be a FIAT currency (e.g., USD, EUR, VND)
 */
export function isCryptoSymbol(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  return CRYPTO_SET.has(sym) || sym.length > 3;
}

/**
 * Creates an Asset object from a symbol string.
 * Automatically determines if the asset is CRYPTO or FIAT.
 */
export function createAssetFromSymbol(symbolInput: string): Asset {
  const symbol = String(symbolInput || "").toUpperCase();
  const type = isCryptoSymbol(symbol) ? "CRYPTO" : "FIAT";
  return { type, symbol };
}
