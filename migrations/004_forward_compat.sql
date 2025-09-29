-- Forward-compatible migration: IDs, JSONB, soft deletes, versioning, FX snapshot, FKs, indexes
-- This migration is additive and non-breaking. It keeps legacy name columns for read compatibility.

BEGIN;

-- 1) Add soft delete columns to master data and transactions
ALTER TABLE IF EXISTS accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE IF EXISTS assets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE IF EXISTS tags ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 2) Add extensibility/versioning columns to transactions
ALTER TABLE IF EXISTS transactions
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS fx_snapshot JSONB;

-- 3) Add ID-based foreign key columns (nullable for backfill period)
ALTER TABLE IF EXISTS transactions
    ADD COLUMN IF NOT EXISTS account_id INTEGER,
    ADD COLUMN IF NOT EXISTS asset_id INTEGER,
    ADD COLUMN IF NOT EXISTS tag_id INTEGER,
    ADD COLUMN IF NOT EXISTS type_id INTEGER;

-- 4) Backfill IDs from existing names/symbols
-- Note: Use DISTINCT ON to avoid accidental multiple matches; rely on UNIQUEs in master tables
UPDATE transactions t
SET account_id = a.id
FROM accounts a
WHERE t.account_id IS NULL AND t.account = a.name;

UPDATE transactions t
SET asset_id = s.id
FROM assets s
WHERE t.asset_id IS NULL AND t.asset = s.symbol;

UPDATE transactions t
SET tag_id = g.id
FROM tags g
WHERE t.tag_id IS NULL AND t.tag = g.name;

UPDATE transactions t
SET type_id = tt.id
FROM transaction_types tt
WHERE t.type_id IS NULL AND t.type = tt.name;

-- 5) Add foreign key constraints (NOT enforcing NOT NULL yet)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_account_id' AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_account_id FOREIGN KEY (account_id) REFERENCES accounts(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_asset_id' AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_asset_id FOREIGN KEY (asset_id) REFERENCES assets(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_tag_id' AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_tag_id FOREIGN KEY (tag_id) REFERENCES tags(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_transactions_type_id' AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions
            ADD CONSTRAINT fk_transactions_type_id FOREIGN KEY (type_id) REFERENCES transaction_types(id);
    END IF;
END $$;

-- 6) Add recommended CHECK constraints where safe (non-strict to avoid legacy failures)
-- Use NOT VALID initially; can be VALIDATED later after data cleanup
ALTER TABLE transactions ADD CONSTRAINT chk_transactions_quantity_positive CHECK (quantity > 0) NOT VALID;
ALTER TABLE transactions ADD CONSTRAINT chk_transactions_price_local_nonneg CHECK (price_local >= 0) NOT VALID;

-- 7) Indexes for new columns and JSONB
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tag_id ON transactions(tag_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type_id ON transactions(type_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type_id ON transactions(date, type_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_metadata_gin ON transactions USING GIN (metadata);

-- 8) Add transaction_links table to track logical relationships (stake-unstake, borrow-repay, etc.)
CREATE TABLE IF NOT EXISTS transaction_links (
    id SERIAL PRIMARY KEY,
    link_type VARCHAR(50) NOT NULL, -- e.g., 'stake_unstake', 'borrow_repay'
    from_tx UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    to_tx UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_links_from ON transaction_links(from_tx);
CREATE INDEX IF NOT EXISTS idx_transaction_links_to ON transaction_links(to_tx);
CREATE INDEX IF NOT EXISTS idx_transaction_links_type ON transaction_links(link_type);

COMMIT;


