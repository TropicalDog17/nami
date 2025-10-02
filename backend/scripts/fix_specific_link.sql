-- Fix the specific withdrawal link if needed
-- Unlink first if you want to try a different deposit

-- Step 1: Remove current link (if needed)
UPDATE transactions
SET deposit_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';

-- Step 2: Find and link to a better deposit (example with an older deposit)
-- This looks for a deposit from Sept 29th that might have a different cost basis
UPDATE transactions w
SET deposit_id = d.id,
    updated_at = CURRENT_TIMESTAMP
FROM transactions d
WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb'
  AND d.id = 'a64c66f3-6d40-43c4-911c-c41cb259a795' -- Sept 29 deposit
  AND d.asset = 'USDT';

-- Step 3: Verify the new link and calculate expected P&L
SELECT
    'NEW LINKED PAIR' as analysis,
    d.id as deposit_id,
    d.quantity as deposit_qty,
    d.amount_usd as deposit_amount,
    d.price_local as deposit_price,
    d.date as deposit_date,
    w.id as withdraw_id,
    w.quantity as withdraw_qty,
    w.amount_usd as withdraw_amount,
    w.price_local as withdraw_price,
    w.date as withdraw_date,
    -- Expected P&L with new link
    w.amount_usd - (w.quantity / d.quantity) * d.amount_usd as expected_pnl_usd,
    d.price_local - w.price_local as price_difference_per_unit
FROM transactions d
JOIN transactions w ON w.deposit_id = d.id
WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';