import { describe, it, expect } from "vitest";
import { createAssetFromSymbol, isCryptoSymbol } from "../src/utils/asset.util";

describe("Asset Type Detection", () => {
  describe("isCryptoSymbol", () => {
    it("should identify known crypto symbols", () => {
      expect(isCryptoSymbol("BTC")).toBe(true);
      expect(isCryptoSymbol("ETH")).toBe(true);
      expect(isCryptoSymbol("SOL")).toBe(true);
      expect(isCryptoSymbol("btc")).toBe(true); // case insensitive
    });

    it("should identify FIAT currencies", () => {
      expect(isCryptoSymbol("USD")).toBe(false);
      expect(isCryptoSymbol("EUR")).toBe(false);
      expect(isCryptoSymbol("VND")).toBe(false);
      expect(isCryptoSymbol("GBP")).toBe(false);
    });

    it("should identify crypto by length > 3", () => {
      expect(isCryptoSymbol("USDT")).toBe(true);
      expect(isCryptoSymbol("USDC")).toBe(true);
      expect(isCryptoSymbol("MATIC")).toBe(true);
    });
  });

  describe("createAssetFromSymbol", () => {
    it("should create crypto assets for known crypto symbols", () => {
      expect(createAssetFromSymbol("BTC")).toEqual({
        type: "CRYPTO",
        symbol: "BTC",
      });
      expect(createAssetFromSymbol("eth")).toEqual({
        type: "CRYPTO",
        symbol: "ETH",
      });
    });

    it("should create FIAT assets for currency symbols", () => {
      expect(createAssetFromSymbol("USD")).toEqual({
        type: "FIAT",
        symbol: "USD",
      });
      expect(createAssetFromSymbol("vnd")).toEqual({
        type: "FIAT",
        symbol: "VND",
      });
    });

    it("should handle stablecoins correctly", () => {
      expect(createAssetFromSymbol("USDT")).toEqual({
        type: "CRYPTO",
        symbol: "USDT",
      });
      expect(createAssetFromSymbol("USDC")).toEqual({
        type: "CRYPTO",
        symbol: "USDC",
      });
    });
  });
});
