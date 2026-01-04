import { BaseDbRepository } from "./base-db.repository";
import { Rate, Asset, assetKey } from "../types";

export interface PriceCacheEntry {
  cacheKey: string;
  assetType: string;
  assetSymbol: string;
  rateUsd: number;
  timestamp: string;
  source: Rate["source"];
  createdAt: string;
}

// Database-based implementation for price cache
export class PriceCacheRepository extends BaseDbRepository {
  /**
   * Get a cached rate by cache key
   */
  getByCacheKey(cacheKey: string): Rate | null {
    const row = this.findOne(
      `SELECT * FROM price_cache WHERE cache_key = ?`,
      [cacheKey],
      (r: any) => r,
    );

    if (!row) return null;

    return {
      asset: {
        type: row.asset_type,
        symbol: row.asset_symbol,
      },
      rateUSD: row.rate_usd,
      timestamp: row.timestamp,
      source: row.source,
    };
  }

  /**
   * Save a rate to cache
   */
  save(rate: Rate, cacheKey: string): void {
    const now = new Date().toISOString();
    this.execute(
      `INSERT OR REPLACE INTO price_cache
       (cache_key, asset_type, asset_symbol, rate_usd, timestamp, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cacheKey,
        rate.asset.type,
        rate.asset.symbol.toUpperCase(),
        rate.rateUSD,
        rate.timestamp,
        rate.source,
        now,
      ],
    );
  }

  /**
   * Get all cached timestamps for an asset (for checking gaps)
   */
  getTimestampsForAsset(asset: Asset): string[] {
    const rows = this.findMany(
      `SELECT timestamp FROM price_cache
       WHERE asset_type = ? AND asset_symbol = ?
       ORDER BY timestamp ASC`,
      [asset.type, asset.symbol.toUpperCase()],
      (r: any) => r.timestamp,
    );
    return rows;
  }

  /**
   * Get cached rates for an asset within a date range
   */
  getRatesInRange(asset: Asset, startDate: Date, endDate: Date): Rate[] {
    const rows = this.findMany(
      `SELECT * FROM price_cache
       WHERE asset_type = ? AND asset_symbol = ?
       AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [
        asset.type,
        asset.symbol.toUpperCase(),
        startDate.toISOString(),
        endDate.toISOString(),
      ],
      (r: any) => ({
        asset: {
          type: r.asset_type,
          symbol: r.asset_symbol,
        },
        rateUSD: r.rate_usd,
        timestamp: r.timestamp,
        source: r.source,
      }),
    );
    return rows;
  }

  /**
   * Delete old cache entries (for cleanup)
   */
  deleteOlderThan(date: Date): number {
    const result = this.execute(
      `DELETE FROM price_cache WHERE created_at < ?`,
      [date.toISOString()],
    );
    return result.changes;
  }

  /**
   * Get count of cached entries for an asset
   */
  getCountForAsset(asset: Asset): number {
    const row = this.findOne(
      `SELECT COUNT(*) as count FROM price_cache
       WHERE asset_type = ? AND asset_symbol = ?`,
      [asset.type, asset.symbol.toUpperCase()],
      (r: any) => r.count,
    );
    return row || 0;
  }

  /**
   * Get the latest cached timestamp for an asset
   */
  getLatestTimestamp(asset: Asset): string | null {
    const row = this.findOne(
      `SELECT timestamp FROM price_cache
       WHERE asset_type = ? AND asset_symbol = ?
       ORDER BY timestamp DESC LIMIT 1`,
      [asset.type, asset.symbol.toUpperCase()],
      (r: any) => r.timestamp,
    );
    return row || null;
  }

  /**
   * Get the oldest cached timestamp for an asset
   */
  getOldestTimestamp(asset: Asset): string | null {
    const row = this.findOne(
      `SELECT timestamp FROM price_cache
       WHERE asset_type = ? AND asset_symbol = ?
       ORDER BY timestamp ASC LIMIT 1`,
      [asset.type, asset.symbol.toUpperCase()],
      (r: any) => r.timestamp,
    );
    return row || null;
  }
}

// Singleton instance
export const priceCacheRepository = new PriceCacheRepository();
