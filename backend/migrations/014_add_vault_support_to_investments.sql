-- Add vault support to investments table
ALTER TABLE investments
ADD COLUMN is_vault BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN vault_name VARCHAR(255),
ADD COLUMN vault_status VARCHAR(20),
ADD COLUMN vault_ended_at TIMESTAMPTZ;

-- Create indexes for vault queries
CREATE INDEX idx_investments_is_vault ON investments(is_vault);
CREATE INDEX idx_investments_vault_status ON investments(vault_status);
CREATE INDEX idx_investments_vault_name ON investments(vault_name) WHERE vault_name IS NOT NULL;