-- Add missing position close transaction for the remaining 225 USDT
-- This will properly account for the loss on the remaining position

-- Step 1: Create a "write-off" or "loss" transaction for the remaining 225 USDT
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
    gen_random_uuid(), -- Generate new UUID
    '2025-10-01', -- Same date as withdrawal
    'loss', -- Using 'loss' transaction type
    'USDT',
    'Futures',
    225, -- Remaining quantity
    1.00001867, -- Same entry price
    225.0042, -- 225 * 1.00001867
    1, -- FX rates
    1,
    225.00, -- Rounded
    225.00,
    0, -- No fees
    0,
    -225, -- Negative delta (closing position)
    -225.00, -- Loss cashflow
    -225.00,
    true, -- Internal flow since this is accounting adjustment
    'd299bc21-18ac-4920-8f3f-067c76418574', -- Link to original deposit
    '2025-10-01', -- Mark position as closed
    'Position close - remaining balance written off as loss',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Step 2: Update the original deposit to mark it as fully closed
UPDATE transactions
SET exit_date = '2025-10-01',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'd299bc21-18ac-4920-8f3f-067c76418574';

-- Step 3: Show the complete position lifecycle
SELECT
    'COMPLETE POSITION LIFECYCLE' as analysis,
    d.id as original_deposit_id,
    d.quantity as deposit_qty,
    d.amount_usd as deposit_amount,
    d.date as deposit_date,
    w.id as withdrawal_id,
    w.quantity as withdrawn_qty,
    w.amount_usd as withdrawn_amount,
    l.id as loss_transaction_id,
    l.quantity as loss_qty,
    l.amount_usd as loss_amount,
    -- Calculations
    (w.quantity + l.quantity) as total_closed_qty,
    (w.amount_usd + l.amount_usd) as total_withdrawn_amount,
    d.amount_usd - (w.amount_usd + l.amount_usd) as total_loss,
    -- Expected P&L should now show the loss
    d.amount_usd - (w.amount_usd + l.amount_usd) as expected_realized_pnl_usd
FROM transactions d
LEFT JOIN transactions w ON w.deposit_id = d.id AND w.type = 'withdraw'
LEFT JOIN transactions l ON l.deposit_id = d.id AND l.type = 'loss'
WHERE d.id = 'd299bc21-18ac-4920-8f3f-067c76418574';