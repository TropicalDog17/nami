-- Find exact 275 USDT deposits that should be linked to the withdrawal
-- This looks for deposits with the exact quantity (not larger deposits)

SELECT
    'EXACT QUANTITY MATCHES' as analysis,
    d.id,
    d.type,
    d.account,
    d.quantity,
    d.amount_usd,
    d.price_local,
    d.date,
    -- P&L if this exact deposit was linked
    275.01 - d.amount_usd as potential_pnl_usd,
    d.price_local - 1.00001867 as price_difference_per_unit,
    -- Days between transactions
    '2025-10-01'::date - d.date as days_held
FROM transactions d
WHERE d.asset = 'USDT'
  AND d.type IN ('deposit', 'stake', 'buy')
  AND d.quantity = 275 -- Looking for exact 275 USDT deposits
  AND d.date <= '2025-10-01'
ORDER BY d.date DESC;

-- If no exact match found, show closest matches
SELECT
    'CLOSEST QUANTITY MATCHES' as analysis,
    d.id,
    d.type,
    d.account,
    d.quantity,
    d.amount_usd,
    d.price_local,
    d.date,
    ABS(d.quantity - 275) as quantity_difference,
    -- P&L if this deposit was linked
    275.01 - (d.amount_usd / d.quantity) * 275 as potential_pnl_usd
FROM transactions d
WHERE d.asset = 'USDT'
  AND d.type IN ('deposit', 'stake', 'buy')
  AND d.quantity <> 275
  AND d.date <= '2025-10-01'
ORDER BY ABS(d.quantity - 275) ASC
LIMIT 5;