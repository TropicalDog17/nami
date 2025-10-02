-- Fix the deposit_id link for the withdraw transaction
-- This will enable proper P&L calculation

UPDATE transactions
SET deposit_id = 'd299bc21-18ac-4920-8f3f-067c76418574',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'e6fa41de-b32c-472c-82ef-e7572ea0e7eb';

-- Verify the update
SELECT
    id,
    type,
    asset,
    quantity,
    amount_usd,
    deposit_id,
    entry_date,
    exit_date
FROM transactions
WHERE id IN ('e6fa41de-b32c-472c-82ef-e7572ea0e7eb', 'd299bc21-18ac-4920-8f3f-067c76418574')
ORDER BY date;