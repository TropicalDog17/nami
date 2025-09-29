-- Performance indexes for transaction tracking system

-- Transaction table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_tag ON transactions(tag);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_date_asset ON transactions(date, asset);
CREATE INDEX IF NOT EXISTS idx_transactions_account_asset ON transactions(account, asset);

-- FX rate lookup indexes
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates(from_currency, to_currency, date);
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates(date);

-- Transaction type audit indexes
CREATE INDEX IF NOT EXISTS idx_transaction_type_audit_type_id ON transaction_type_audit(type_id);
CREATE INDEX IF NOT EXISTS idx_transaction_type_audit_changed_at ON transaction_type_audit(changed_at);

-- Master data indexes
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
