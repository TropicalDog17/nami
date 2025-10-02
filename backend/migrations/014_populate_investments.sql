-- Migration: Populate investments from existing transactions
-- This script creates investment records from existing transaction data
-- and links transactions to their corresponding investments

BEGIN;

-- Create a temporary mapping table to track the relationships
CREATE TEMPORARY TABLE temp_investment_mapping (
    transaction_id UUID PRIMARY KEY,
    investment_id UUID,
    asset VARCHAR(50),
    account VARCHAR(100),
    horizon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- First, create investment records for all deposit transactions (stake, deposit, buy)
-- Group by asset, account, and horizon to create one investment per group
INSERT INTO investments (
    id,
    asset,
    account,
    horizon,
    deposit_date,
    deposit_qty,
    deposit_cost,
    deposit_unit_cost,
    withdrawal_qty,
    withdrawal_value,
    withdrawal_unit_price,
    pnl,
    pnl_percent,
    is_open,
    remaining_qty,
    cost_basis_method,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() as id,
    t.asset,
    t.account,
    CASE WHEN t.horizon = '' THEN NULL ELSE t.horizon END as horizon,
    MIN(t.date) as deposit_date,
    COALESCE(SUM(t.quantity), 0) as deposit_qty,
    COALESCE(SUM(t.amount_usd), 0) as deposit_cost,
    CASE
        WHEN SUM(t.quantity) > 0 THEN SUM(t.amount_usd) / SUM(t.quantity)
        ELSE 0
    END as deposit_unit_cost,
    0 as withdrawal_qty,
    0 as withdrawal_value,
    0 as withdrawal_unit_price,
    0 as pnl,
    0 as pnl_percent,
    TRUE as is_open,
    COALESCE(SUM(t.quantity), 0) as remaining_qty,
    'fifo' as cost_basis_method,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM transactions t
WHERE t.type = 'stake'
  AND t.asset IS NOT NULL
  AND t.account IS NOT NULL
GROUP BY t.asset, t.account, t.horizon
HAVING COALESCE(SUM(t.quantity), 0) > 0;

-- Link deposit transactions to their corresponding investments
UPDATE temp_investment_mapping SET
    investment_id = i.id,
    asset = i.asset,
    account = i.account,
    horizon = i.horizon
FROM investments i
WHERE
    temp_investment_mapping.transaction_id IN (
        SELECT t.id
        FROM transactions t
        WHERE t.type IN ('deposit', 'stake', 'buy')
          AND t.asset IS NOT NULL
          AND t.account IS NOT NULL
          AND i.asset = t.asset
          AND i.account = t.account
          AND (i.horizon = t.horizon OR (i.horizon IS NULL AND t.horizon IS NULL))
    );

-- Process withdrawal transactions and update investments
WITH withdrawals AS (
    SELECT
        i.id as investment_id,
        t.id as transaction_id,
        t.asset,
        t.account,
        t.horizon,
        t.quantity as withdrawal_qty,
        t.amount_usd as withdrawal_value,
        CASE
            WHEN t.quantity > 0 THEN t.amount_usd / t.quantity
            ELSE 0
        END as withdrawal_unit_price,
        t.date as withdrawal_date
    FROM transactions t
    JOIN investments i ON (
        t.asset = i.asset
        AND t.account = i.account
        AND (t.horizon = i.horizon OR (t.horizon IS NULL AND i.horizon IS NULL))
        AND i.is_open = TRUE
        AND i.remaining_qty > 0
    )
    WHERE t.type IN ('withdraw', 'unstake', 'sell')
      AND t.asset IS NOT NULL
      AND t.account IS NOT NULL
      AND t.quantity > 0
),
investment_updates AS (
    SELECT
        investment_id,
        SUM(withdrawal_qty) as total_withdrawn_qty,
        SUM(withdrawal_value) as total_withdrawn_value,
        AVG(withdrawal_unit_price) as avg_withdrawal_price,
        MIN(withdrawal_date) as first_withdrawal_date,
        COUNT(*) as withdrawal_count
    FROM withdrawals
    GROUP BY investment_id
)
UPDATE investments i SET
    withdrawal_qty = u.total_withdrawn_qty,
    withdrawal_value = u.total_withdrawn_value,
    withdrawal_unit_price = u.avg_withdrawal_price,
    withdrawal_date = u.first_withdrawal_date,
    remaining_qty = GREATEST(0, i.deposit_qty - u.total_withdrawn_qty),
    pnl = u.total_withdrawn_value - (i.deposit_unit_cost * u.total_withdrawn_qty),
    pnl_percent = CASE
        WHEN i.deposit_unit_cost * u.total_withdrawn_qty > 0
        THEN ((u.total_withdrawn_value - (i.deposit_unit_cost * u.total_withdrawn_qty)) / (i.deposit_unit_cost * u.total_withdrawn_qty)) * 100
        ELSE 0
    END,
    is_open = GREATEST(0, i.deposit_qty - u.total_withdrawn_qty) > 0,
    updated_at = CURRENT_TIMESTAMP
FROM investment_updates u
WHERE i.id = u.investment_id;

-- Link withdrawal transactions to investments
UPDATE transactions t SET
    investment_id = i.id
FROM investments i
WHERE t.type IN ('withdraw', 'unstake', 'sell')
  AND t.asset IS NOT NULL
  AND t.account IS NOT NULL
  AND t.asset = i.asset
  AND t.account = i.account
  AND (t.horizon = i.horizon OR (t.horizon IS NULL AND i.horizon IS NULL));

-- Link deposit transactions to investments
UPDATE transactions t SET
    investment_id = i.id
FROM investments i
WHERE t.type = 'stake'
  AND t.asset IS NOT NULL
  AND t.account IS NOT NULL
  AND t.asset = i.asset
  AND t.account = i.account
  AND (t.horizon = i.horizon OR (t.horizon IS NULL AND i.horizon IS NULL));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_investment_id ON transactions(investment_id);
CREATE INDEX IF NOT EXISTS idx_investments_asset_account ON investments(asset, account);
CREATE INDEX IF NOT EXISTS idx_investments_is_open ON investments(is_open);

-- Clean up
DROP TABLE IF EXISTS temp_investment_mapping;

-- Log the migration results
DO $$
DECLARE
    investment_count INTEGER;
    transaction_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO investment_count FROM investments;
    SELECT COUNT(*) INTO transaction_count FROM transactions WHERE investment_id IS NOT NULL;

    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE 'Created % investment records', investment_count;
    RAISE NOTICE 'Linked % transactions to investments', transaction_count;
END $$;

COMMIT;