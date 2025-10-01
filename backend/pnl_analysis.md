# PnL Calculation Fix Analysis

## Problem Identified
The PnL calculation was returning very small values (0.0045) instead of expected larger values.

## Root Causes Found

### 1. Limited PnL Sources
Original code only calculated PnL from stake-unstake pairs:
```sql
-- OLD: Only stake-unstake pairs
FROM transaction_links l
WHERE l.link_type = 'stake_unstake'
```

### 2. Missing Sell Transaction PnL
The calculation ignored gains/losses from regular sell transactions.

### 3. ROI Calculation Issues
The ROI calculation had potential issues with cost basis when multiple unstakes from same deposit occurred.

## Fixes Applied

### 1. Expanded PnL Sources
```sql
-- NEW: Includes both stake-unstake and sell transactions
WITH stake_pairs AS (...),
stake_unstake_pnl AS (...),
sell_pnl AS (
    SELECT
        COALESCE(SUM(
            CASE
                WHEN t.amount_usd > 0 AND t.quantity > 0 THEN
                    (t.price_usd - t.amount_usd / NULLIF(t.quantity, 0)) * t.quantity
                ELSE 0
            END
        ), 0) AS usd
    FROM transactions t
    WHERE t.type = 'sell'
    AND t.date >= $1 AND t.date <= $2
)
SELECT su.usd + sp.usd AS realized_pnl_usd
```

### 2. Improved Cost Basis Calculation
```sql
-- NEW: Includes cost basis from both stake-unstake and sell transactions
stake_cost_basis AS (...),
sell_cost_basis AS (
    SELECT COALESCE(SUM(
        CASE
            WHEN t.amount_usd < 0 THEN ABS(t.amount_usd)  -- We paid this amount
            ELSE 0
        END
    ), 0) as usd
    FROM transactions t
    WHERE t.type = 'sell'
)
SELECT scb.usd + sellb.usd
```

### 3. Added Debug Logging
Added comprehensive logging to track:
- Transaction counts in the period
- Stake-unstake pairs found
- Sell transactions found
- Calculated PnL values

## Expected Impact

### Before Fix
- Only stake-unstake PnL calculated
- Very small values (0.0045) likely due to:
  - No linked stake-unstake transactions in period
  - Missing sell transaction PnL
  - Possible price calculation issues

### After Fix
- Both stake-unstake AND sell transaction PnL included
- More comprehensive cost basis calculation
- Better debugging capabilities
- Should show larger, more realistic PnL values

## Test Cases

### Case 1: Only Stake-Unstake Pairs
If only stake-unstake transactions exist:
- Should work as before (unchanged)
- Better debugging shows why values are small

### Case 2: Only Sell Transactions
If only sell transactions exist:
- Previously: PnL = 0 (ignored)
- Now: PnL calculated from price differences

### Case 3: Mixed Transactions
If both stake-unstake and sells exist:
- Previously: Only stake-unstake PnL
- Now: Combined PnL from both sources

## Next Steps for Verification

1. **Run with debug logging enabled** to see transaction counts
2. **Check database** for:
   - Unlinked stake-unstake transactions
   - Missing transaction_links
   - Sell transaction prices
3. **Verify price data** in transactions table
4. **Test with known transactions** to validate calculations

## Potential Further Issues

1. **Price Data Quality**: If transactions don't have reliable price_usd values
2. **Missing Links**: Stake-unstake pairs not properly linked in transaction_links
3. **FX Rate Issues**: USD/VND conversion problems
4. **Cost Basis Method**: FIFO vs specific identification not implemented