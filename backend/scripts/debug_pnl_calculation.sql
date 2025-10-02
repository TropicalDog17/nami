-- Debug P&L calculation
-- This script shows the actual calculation and helps identify issues

-- Show the currently linked transaction pair
SELECT
    'CURRENTLY LINKED PAIR' as analysis,
    d.id as deposit_id,
    d.type as deposit_type,
    d.account as deposit_account,
    d.quantity as deposit_quantity,
    d.amount_local,
    d.price_local,
    d.amount_usd,
    d.date as deposit_date,
    w.id as withdraw_id,
    w.type as withdraw_type,
    w.account as withdraw_account,
    w.quantity as withdraw_quantity,
    w.amount_local,
    w.price_local,
    w.amount_usd,
    w.date as withdraw_date,
    -- P&L calculation
    w.amount_usd - (w.quantity / d.quantity) * d.amount_usd as calculated_pnl_usd,
    (w.quantity / d.quantity) * d.amount_usd as proportional_cost_basis,
    w.price_local - d.price_local as price_difference,
    w.price_local / d.price_local - 1 as price_change_percent
FROM transactions d
JOIN transactions w ON w.deposit_id = d.id
WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';

-- Find all potential deposits for this withdrawal
SELECT
    'POTENTIAL MATCHING DEPOSITS' as analysis,
    d.id,
    d.type,
    d.account,
    d.quantity,
    d.amount_usd,
    d.price_local,
    d.date,
    -- Calculate P&L if this deposit was linked
    275.01 - (275 / d.quantity) * d.amount_usd as potential_pnl_usd,
    ABS(275 - d.quantity) as quantity_difference,
    ABS(d.price_local - 1.00001867) as price_difference_from_current
FROM transactions d
WHERE d.type IN ('deposit', 'stake', 'buy')
  AND d.asset = 'USDT'
  AND d.quantity >= 275
  AND d.date <= '2025-10-01'
ORDER BY d.date DESC;

-- Show all USDT transactions in the period
SELECT
    'ALL USDT TRANSACTIONS' as analysis,
    id,
    type,
    account,
    quantity,
    amount_usd,
    price_local,
    deposit_id,
    date,
    internal_flow
FROM transactions
WHERE asset = 'USDT'
  AND date >= '2025-09-01'
  AND date <= '2025-10-01'
ORDER BY date, type;