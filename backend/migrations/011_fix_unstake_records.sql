-- Migration to fix any unstake records that might have incorrect amounts
-- This migration doesn't change any data structure, just documents that
-- unstake transactions should always have explicit amounts and close_all is just a flag

-- No schema changes needed, but we can add a comment to document the expected behavior
COMMENT ON COLUMN transactions.quantity IS 'For unstake: must be explicitly provided, not derived from exit_amount_usd or close_all';

-- Note: If there are any existing unstake records where the quantity was incorrectly
-- derived from exit_amount_usd, manual correction may be needed on a case-by-case basis.
-- Run this query to find potentially problematic records:
-- SELECT id, date, type, asset, account, quantity, amount_usd, price_local
-- FROM transactions
-- WHERE type IN ('withdraw', 'transfer_in')
--   AND note LIKE '%unstake%'
-- ORDER BY date DESC;
