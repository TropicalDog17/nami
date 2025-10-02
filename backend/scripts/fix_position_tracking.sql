-- Fix position tracking for proper P&L calculation
-- This implements proper lot tracking instead of proportional allocation

-- Step 1: Update the withdrawal to use proper position-based cost basis
-- The withdrawal should use the actual cost of the specific quantity being withdrawn

-- First, let's see the current state
SELECT
    'CURRENT POSITION STATE' as analysis,
    d.id as deposit_id,
    d.quantity as original_quantity,
    d.amount_usd as original_amount,
    d.price_local as entry_price,
    d.date as entry_date,
    w.id as withdraw_id,
    w.quantity as withdrawn_quantity,
    w.amount_usd as withdrawn_amount,
    w.price_local as exit_price,
    w.date as exit_date,
    (d.quantity - w.quantity) as remaining_quantity,
    -- Correct P&L calculation (cost basis of withdrawn quantity)
    w.quantity * (w.price_local - d.price_local) as correct_pnl_usd,
    -- Current (wrong) calculation
    w.amount_usd - (w.quantity / d.quantity) * d.amount_usd as current_calculation
FROM transactions d
JOIN transactions w ON w.deposit_id = d.id
WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';

-- Step 2: Check if there are other transactions that should be linked to the remaining position
SELECT
    'REMAINING POSITION TRANSACTIONS' as analysis,
    id,
    type,
    quantity,
    amount_usd,
    deposit_id,
    date,
    internal_flow
FROM transactions
WHERE asset = 'USDT'
  AND account = 'Futures'
  AND date >= '2025-10-01'
  AND type IN ('transfer_out', 'withdraw', 'unstake')
  AND id != 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb'
ORDER BY date;

-- Step 3: Show what the P&L calculation should be using position tracking
WITH position_tracking AS (
    SELECT
        d.id as position_id,
        d.quantity as initial_quantity,
        d.amount_usd as initial_amount,
        d.price_local as entry_price,
        w.quantity as closed_quantity,
        w.amount_usd as closed_amount,
        w.price_local as exit_price,
        -- Remaining position info
        (d.quantity - w.quantity) as remaining_quantity,
        -- P&L on closed portion
        w.quantity * (w.price_local - d.price_local) as pnl_closed_usd,
        -- Cost basis of remaining position
        (d.quantity - w.quantity) * d.price_local as remaining_cost_basis_usd
    FROM transactions d
    JOIN transactions w ON w.deposit_id = d.id
    WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb'
)
SELECT
    'POSITION TRACKING P&L' as analysis,
    position_id,
    initial_quantity,
    entry_price,
    closed_quantity,
    exit_price,
    pnl_closed_usd,
    remaining_quantity,
    remaining_cost_basis_usd,
    -- This is the realized P&L that should be reported
    pnl_closed_usd as correct_realized_pnl_usd
FROM position_tracking;