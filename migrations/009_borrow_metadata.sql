-- Extend transactions with borrow metadata
-- Adds APR (as decimal fraction per year), term in days, and active flag

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS borrow_apr DECIMAL(12,8),
    ADD COLUMN IF NOT EXISTS borrow_term_days INTEGER,
    ADD COLUMN IF NOT EXISTS borrow_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS internal_flow BOOLEAN;

-- Optional: backfill existing rows of type != 'borrow' to NULL active to avoid confusion
-- We keep borrow_active default TRUE so existing borrows (if any) are considered active


