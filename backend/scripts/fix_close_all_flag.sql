-- Fix the withdrawal to properly represent "close all" operation
-- This will update the original deposit to be marked as fully closed

-- Step 1: Check current state
SELECT
    'CURRENT STATE' as analysis,
    d.id as deposit_id,
    d.quantity as deposit_qty,
    d.amount_usd as deposit_amount,
    d.exit_date as deposit_exit_date,
    w.id as withdraw_id,
    w.quantity as withdraw_qty,
    w.amount_usd as withdraw_amount,
    w.date as withdraw_date,
    (d.quantity - w.quantity) as remaining_qty,
    d.amount_usd - w.amount_usd as remaining_amount_usd
FROM transactions d
JOIN transactions w ON w.deposit_id = d.id
WHERE w.id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';

-- Step 2: Since this is meant to be "exit all", update the original deposit to show it's fully closed
-- Even though only 275 was withdrawn, the remaining 225 should be written off
UPDATE transactions
SET exit_date = '2025-10-01',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'd299bc21-18ac-4920-8f3f-067c76418574';

-- Step 3: Add a "write-off" transaction for the remaining 225 USDT that wasn't actually withdrawn
INSERT INTO transactions (
    id,
    date,
    type,
    asset,
    account,
    quantity,
    price_local,
    amount_local,
    fx_to_usd,
    fx_to_vnd,
    amount_usd,
    amount_vnd,
    fee_usd,
    fee_vnd,
    delta_qty,
    cashflow_usd,
    cashflow_vnd,
    internal_flow,
    deposit_id,
    exit_date,
    note,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    '2025-10-01',
    'expense', -- Using expense type for accounting write-off
    'USDT',
    'Futures',
    225, -- Remaining quantity being written off
    1.00001867, -- Original entry price
    225.0042,
    1,
    1,
    225.00,
    225.00,
    0,
    0,
    -225,
    -225.00, -- Loss written off
    -225.00,
    true, -- Internal accounting adjustment
    'd299bc21-18ac-4920-8f3f-067c76418574',
    '2025-10-01',
    'Position write-off - remaining balance from close all operation',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Step 4: Verify the fix
SELECT
    'FIXED POSITION LIFECYCLE' as analysis,
    d.id as deposit_id,
    d.quantity as deposit_qty,
    d.amount_usd as deposit_amount,
    d.exit_date as deposit_exit_date,
    w.id as withdraw_id,
    w.quantity as withdraw_qty,
    w.amount_usd as withdraw_amount,
    wo.id as writeoff_id,
    wo.quantity as writeoff_qty,
    wo.amount_usd as writeoff_amount,
    -- Total should now show complete position closure
    (w.quantity + wo.quantity) as total_closed_qty,
    (w.amount_usd + wo.amount_usd) as total_closed_amount,
    -- The loss should now be properly reflected
    d.amount_usd - (w.amount_usd + wo.amount_usd) as total_loss
FROM transactions d
LEFT JOIN transactions w ON w.deposit_id = d.id AND w.type = 'withdraw'
LEFT JOIN transactions wo ON wo.deposit_id = d.id AND wo.type = 'expense'
WHERE d.id = 'd299bc21-18ac-4920-8f3f-067c76418574';