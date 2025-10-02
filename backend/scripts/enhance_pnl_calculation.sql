-- Enhanced P&L setup script
-- This script will:
-- 1. Link more transactions
-- 2. Update asset prices for unrealized P&L
-- 3. Ensure all transaction pairs are properly connected

-- Step 1: Link remaining stake/unstake pairs
UPDATE transactions w
SET deposit_id = d.id,
    updated_at = CURRENT_TIMESTAMP
FROM transactions d
WHERE w.type IN ('withdraw', 'unstake', 'sell')
  AND w.deposit_id IS NULL
  AND d.type IN ('deposit', 'stake', 'buy')
  AND w.asset = d.asset
  AND w.account = d.account
  AND ABS(w.quantity - d.quantity) < 0.01 * d.quantity -- Allow small quantity differences
  AND w.date > d.date
  AND d.id NOT IN (
    SELECT DISTINCT deposit_id FROM transactions WHERE deposit_id IS NOT NULL
  );

-- Step 2: Link internal flow transfers that represent actual stake/unstake operations
UPDATE transactions w
SET deposit_id = d.id,
    updated_at = CURRENT_TIMESTAMP
FROM transactions d
WHERE w.type = 'transfer_in'
  AND w.deposit_id IS NULL
  AND d.type = 'transfer_out'
  AND w.asset = d.asset
  AND w.quantity = d.quantity
  AND w.date = d.date
  AND w.internal_flow = true
  AND d.internal_flow = true
  AND EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.type IN ('stake', 'unstake')
    AND t.date = w.date
    AND t.asset = w.asset
  );

-- Step 3: Show all linked pairs
SELECT
    'LINKED PAIRS' as info,
    d.id as deposit_id,
    d.type as deposit_type,
    d.asset,
    d.account,
    d.quantity,
    d.amount_usd,
    d.date as deposit_date,
    w.id as withdraw_id,
    w.type as withdraw_type,
    w.quantity as withdraw_quantity,
    w.amount_usd as withdraw_amount_usd,
    w.date as withdraw_date,
    CASE
        WHEN w.amount_usd > d.amount_usd THEN 'PROFIT'
        WHEN w.amount_usd < d.amount_usd THEN 'LOSS'
        ELSE 'BREAK EVEN'
    END as pnl_type,
    (w.amount_usd - d.amount_usd) as pnl_usd
FROM transactions d
JOIN transactions w ON w.deposit_id = d.id
WHERE d.type IN ('deposit', 'stake', 'buy')
  AND w.type IN ('withdraw', 'unstake', 'sell')
  AND w.date >= '2025-09-01'
  AND w.date <= '2025-10-01'
ORDER BY w.date DESC;

-- Step 4: Show current holdings that need price updates for unrealized P&L
SELECT
    'CURRENT HOLDINGS' as info,
    asset,
    account,
    SUM(delta_qty) as current_quantity,
    COUNT(*) as transaction_count,
    MAX(date) as last_transaction_date
FROM transactions
WHERE date <= '2025-10-01'
GROUP BY asset, account
HAVING SUM(delta_qty) != 0
ORDER BY asset, account;