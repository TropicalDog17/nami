-- Add deposit_id column for explicit deposit-withdrawal linking
-- This enables specific-deposit tracking (lot tracking) instead of FIFO/average cost

ALTER TABLE transactions
ADD COLUMN deposit_id UUID REFERENCES transactions(id);

-- Add index for performance on lookups
CREATE INDEX idx_transactions_deposit_id ON transactions(deposit_id);

-- Add constraint: only withdrawal types can have deposit_id
ALTER TABLE transactions
ADD CONSTRAINT check_deposit_id_withdrawal
CHECK (
  (type IN ('withdraw', 'unstake', 'sell') AND deposit_id IS NOT NULL) OR
  (type NOT IN ('withdraw', 'unstake', 'sell') AND deposit_id IS NULL)
);

-- Add comment explaining the relationship
COMMENT ON COLUMN transactions.deposit_id IS 'Links withdrawal/unstake/sell transactions to their originating deposit/stake transaction for explicit lot tracking';