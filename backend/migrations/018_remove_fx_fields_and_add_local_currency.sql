-- Remove FX fields from transactions table and add local_currency
-- This migration refactors the transaction storage to use inferred FX rates instead of stored values
-- Part of the FX inference refactor: https://github.com/TropicalDog17/nami/issue/2

BEGIN;

-- Add the new local_currency column to track the native currency of each transaction
ALTER TABLE transactions
ADD COLUMN local_currency VARCHAR(10) NOT NULL DEFAULT 'USD';

-- Populate local_currency based on existing data patterns
-- For most transactions, assume USD as the base currency
-- This can be refined later with more sophisticated logic
UPDATE transactions
SET local_currency = 'USD'
WHERE local_currency = 'USD'; -- This will be true for all rows initially

-- For transactions with non-USD assets (like VND), infer from asset name
UPDATE transactions
SET local_currency = 'VND'
WHERE asset = 'VND' AND local_currency = 'USD';

-- For cryptocurrency transactions, default to USD as standard trading currency
-- This is a reasonable default and matches our inference logic
UPDATE transactions
SET local_currency = 'USD'
WHERE asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'USDP', 'DAI', 'BUSD', 'WETH', 'WBTC') AND local_currency = 'USD';

-- Add NOT NULL constraint for local_currency now that it's populated
ALTER TABLE transactions
ALTER COLUMN local_currency SET NOT NULL;

-- Add fee_local column to store fees in local currency (replaces fee_usd and fee_vnd)
ALTER TABLE transactions
ADD COLUMN fee_local DECIMAL(30,18) NOT NULL DEFAULT 0;

-- Populate fee_local from existing fee data
-- Convert USD fees to local currency using stored FX rates
UPDATE transactions
SET fee_local =
  CASE
    WHEN local_currency = 'USD' THEN fee_usd
    WHEN local_currency = 'VND' AND fx_to_usd > 0 THEN fee_vnd / fx_to_usd
    WHEN local_currency = 'VND' AND fx_to_usd = 0 THEN fee_vnd / 24000 -- fallback rate
    ELSE fee_usd -- fallback to USD
  END;

-- Add cashflow_local column for local currency cashflow (replaces cashflow_usd and cashflow_vnd)
ALTER TABLE transactions
ADD COLUMN cashflow_local DECIMAL(30,18) NOT NULL DEFAULT 0;

-- Populate cashflow_local from existing cashflow data
-- Convert to local currency using stored FX rates
UPDATE transactions
SET cashflow_local =
  CASE
    WHEN local_currency = 'USD' THEN cashflow_usd
    WHEN local_currency = 'VND' AND fx_to_usd > 0 THEN cashflow_vnd / fx_to_usd
    WHEN local_currency = 'VND' AND fx_to_usd = 0 THEN cashflow_vnd / 24000 -- fallback rate
    ELSE cashflow_usd -- fallback to USD
  END;

-- Add NOT NULL constraint for cashflow_local
ALTER TABLE transactions
ALTER COLUMN cashflow_local SET NOT NULL;

-- Create index on local_currency for performance
CREATE INDEX idx_transactions_local_currency ON transactions(local_currency);

-- Drop the obsolete FX columns that are no longer needed
-- These will be inferred dynamically by the backend

-- Drop direct FX rate columns
ALTER TABLE transactions DROP COLUMN IF EXISTS fx_to_usd;
ALTER TABLE transactions DROP COLUMN IF EXISTS fx_to_vnd;

-- Drop pre-calculated amount columns
ALTER TABLE transactions DROP COLUMN IF EXISTS amount_usd;
ALTER TABLE transactions DROP COLUMN IF EXISTS amount_vnd;

-- Drop pre-calculated cashflow columns
ALTER TABLE transactions DROP COLUMN IF EXISTS cashflow_usd;
ALTER TABLE transactions DROP COLUMN IF EXISTS cashflow_vnd;

-- Drop obsolete fee columns
ALTER TABLE transactions DROP COLUMN IF EXISTS fee_usd;
ALTER TABLE transactions DROP COLUMN IF EXISTS fee_vnd;

-- Drop obsolete audit columns related to FX
ALTER TABLE transactions DROP COLUMN IF EXISTS fx_source;
ALTER TABLE transactions DROP COLUMN IF EXISTS fx_timestamp;

-- Add comment to document the new approach
COMMENT ON COLUMN transactions.local_currency IS 'Native currency of the transaction (USD, VND, etc.)';
COMMENT ON COLUMN transactions.fee_local IS 'Transaction fee in local currency';
COMMENT ON COLUMN transactions.cashflow_local IS 'Cash flow amount in local currency';

-- Update table comment to reflect the new FX inference approach
COMMENT ON TABLE transactions IS 'Financial transactions with inferred FX rates - FX rates are calculated dynamically based on transaction date and local_currency';

COMMIT;