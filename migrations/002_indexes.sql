-- Performance indexes for transaction tracking system

-- Transaction table indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_asset ON transactions(asset);
CREATE INDEX idx_transactions_account ON transactions(account);
CREATE INDEX idx_transactions_tag ON transactions(tag);
CREATE INDEX idx_transactions_counterparty ON transactions(counterparty);
CREATE INDEX idx_transactions_date_type ON transactions(date, type);
CREATE INDEX idx_transactions_date_asset ON transactions(date, asset);
CREATE INDEX idx_transactions_account_asset ON transactions(account, asset);

-- FX rate lookup indexes
CREATE INDEX idx_fx_rates_lookup ON fx_rates(from_currency, to_currency, date);
CREATE INDEX idx_fx_rates_date ON fx_rates(date);

-- Transaction type audit indexes
CREATE INDEX idx_transaction_type_audit_type_id ON transaction_type_audit(type_id);
CREATE INDEX idx_transaction_type_audit_changed_at ON transaction_type_audit(changed_at);

-- Master data indexes
CREATE INDEX idx_accounts_type ON accounts(type);
CREATE INDEX idx_assets_symbol ON assets(symbol);
CREATE INDEX idx_tags_category ON tags(category);
