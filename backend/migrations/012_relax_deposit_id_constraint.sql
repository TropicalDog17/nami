-- Relax deposit_id constraint to allow optional linking for withdrawal types
-- This enables unstake operations without requiring an explicit deposit link

-- Drop the existing strict constraint
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS check_deposit_id_withdrawal;

-- Add a more flexible constraint: deposit_id can only be set for withdrawal types, but it's optional
ALTER TABLE transactions
ADD CONSTRAINT check_deposit_id_withdrawal
CHECK (
  deposit_id IS NULL OR type IN ('withdraw', 'unstake', 'sell')
);

-- Update comment to reflect optional nature
COMMENT ON COLUMN transactions.deposit_id IS 'Optionally links withdrawal/unstake/sell transactions to their originating deposit/stake transaction for explicit lot tracking';