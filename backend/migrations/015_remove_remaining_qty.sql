-- Remove deprecated remaining_qty column from investments
BEGIN;

ALTER TABLE investments
    DROP COLUMN IF EXISTS remaining_qty;

COMMIT;


