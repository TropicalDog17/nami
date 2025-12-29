-- Nami Portfolio Database Schema
-- SQLite with better-sqlite3

-- Transactions table with optimized indexes for common queries
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('INITIAL', 'INCOME', 'EXPENSE', 'BORROW', 'LOAN', 'REPAY', 'TRANSFER_OUT', 'TRANSFER_IN')),
  asset_type TEXT NOT NULL CHECK(asset_type IN ('CRYPTO', 'FIAT')),
  asset_symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  account TEXT,
  note TEXT,
  category TEXT,
  tags TEXT,
  counterparty TEXT,
  due_date TEXT,
  transfer_id TEXT,
  loan_id TEXT,
  source_ref TEXT UNIQUE,
  repay_direction TEXT CHECK(repay_direction IN ('BORROW', 'LOAN')),
  rate TEXT NOT NULL,
  usd_amount REAL NOT NULL
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_loan_id ON transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source_ref ON transactions(source_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_composite_date_type ON transactions(created_at, type, account);
CREATE INDEX IF NOT EXISTS idx_transactions_composite_account_date ON transactions(account, created_at DESC);

-- Vault configurations
CREATE TABLE IF NOT EXISTS vaults (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'CLOSED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vaults_status ON vaults(status);

-- Vault entries (high-volume table)
CREATE TABLE IF NOT EXISTS vault_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vault TEXT NOT NULL REFERENCES vaults(name) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAW', 'VALUATION')),
  asset_type TEXT NOT NULL CHECK(asset_type IN ('CRYPTO', 'FIAT')),
  asset_symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  usd_value REAL NOT NULL,
  at TEXT NOT NULL,
  account TEXT,
  note TEXT
);

-- Critical composite index for the slow summary endpoint
CREATE INDEX IF NOT EXISTS idx_vault_entries_vault_at ON vault_entries(vault, at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_entries_composite_vault_date_type ON vault_entries(vault, at, type);
CREATE INDEX IF NOT EXISTS idx_vault_entries_at ON vault_entries(at DESC);

-- Loan agreements
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  counterparty TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('CRYPTO', 'FIAT')),
  asset_symbol TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('DAY', 'MONTH', 'YEAR')),
  start_at TEXT NOT NULL,
  maturity_at TEXT,
  note TEXT,
  account TEXT,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'CLOSED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loans_counterparty ON loans(counterparty);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_composite_status_start ON loans(status, start_at DESC);

-- Admin configuration tables
CREATE TABLE IF NOT EXISTS admin_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT,
  decimals INTEGER NOT NULL DEFAULT 8,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Pending actions (AI processing queue)
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('telegram_text', 'telegram_image', 'bank_statement_excel')),
  raw_input TEXT NOT NULL,
  toon_text TEXT,
  action_json TEXT,
  confidence REAL,
  batch_id TEXT,
  meta TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')),
  created_tx_ids TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_batch_id ON pending_actions(batch_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_composite_status_batch ON pending_actions(status, batch_id);

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('borrowingVaultName', 'Borrowings'),
  ('borrowingMonthlyRate', '0.02'),
  ('defaultSpendingVaultName', 'Spend'),
  ('defaultIncomeVaultName', 'Income');
