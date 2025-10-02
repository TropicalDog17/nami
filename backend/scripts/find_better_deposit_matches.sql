-- Find better deposit matches for the withdrawal
-- This looks for deposits with different cost bases that would generate meaningful P&L

-- First, let's see what the withdrawal should be linked to for maximum P&L accuracy
WITH withdrawal_info AS (
    SELECT
        id,
        asset,
        account,
        quantity,
        amount_usd,
        price_local,
        date
    FROM transactions
    WHERE id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb'
),
potential_deposits AS (
    SELECT
        d.id,
        d.quantity,
        d.amount_usd,
        d.price_local,
        d.date,
        -- Calculate P&L if this deposit was linked
        w.amount_usd - (w.quantity / d.quantity) * d.amount_usd as potential_pnl_usd,
        -- Calculate the effective price this withdrawal would have
        (w.quantity / d.quantity) * d.price_local as effective_price,
        -- Difference in cost basis per unit
        d.price_local - w.price_local as cost_basis_difference_per_unit,
        -- Total cost basis difference
        w.quantity * (d.price_local - w.price_local) as total_cost_basis_difference,
        -- Days between deposit and withdrawal
        w.date - d.date as days_held
    FROM withdrawal_info w
    JOIN transactions d ON (
        d.asset = w.asset
        AND d.type IN ('deposit', 'stake', 'buy')
        AND d.date <= w.date
        AND d.quantity >= w.quantity -- Must have enough quantity
    )
    ORDER BY ABS(d.price_local - w.price_local) DESC -- Most different prices first
)
SELECT
    'BETTER DEPOSIT MATCHES' as analysis,
    id,
    quantity,
    amount_usd,
    price_local,
    date,
    potential_pnl_usd,
    effective_price,
    cost_basis_difference_per_unit,
    total_cost_basis_difference,
    days_held,
    ROW_NUMBER() OVER (ORDER BY ABS(cost_basis_difference_per_unit) DESC) as rank
FROM potential_deposits;

-- Show current USDT holdings that could be sold for future P&L
SELECT
    'CURRENT USDT HOLDINGS' as analysis,
    asset,
    account,
    SUM(delta_qty) as net_quantity,
    COUNT(*) as transaction_count,
    MIN(date) as first_transaction,
    MAX(date) as last_transaction
FROM transactions
WHERE asset = 'USDT'
  AND date <= '2025-10-01'
GROUP BY asset, account
HAVING SUM(delta_qty) != 0
ORDER BY net_quantity DESC;