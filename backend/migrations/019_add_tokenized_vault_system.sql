-- Migration: Add tokenized vault system tables
-- This migration creates the complete vault management system including:
-- 1. vaults - Main vault configuration and metadata
-- 2. vault_assets - Individual asset positions within vaults
-- 3. vault_shares - User ownership shares in vaults
-- 4. vault_transactions - All vault-related transactions
-- 5. vault_performance - Performance tracking over time

-- Main vaults table for tokenized investment vaults
CREATE TABLE IF NOT EXISTS vaults (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'single_asset',
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Token information
    token_symbol VARCHAR(20) NOT NULL,
    token_decimals INTEGER NOT NULL DEFAULT 18,
    total_supply DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Financial metrics
    total_assets_under_management DECIMAL(30,18) NOT NULL DEFAULT 0,
    current_share_price DECIMAL(30,18) NOT NULL DEFAULT 1,
    initial_share_price DECIMAL(30,18) NOT NULL DEFAULT 1,

    -- User-defined token specific fields
    is_user_defined_price BOOLEAN NOT NULL DEFAULT FALSE,
    manual_price_per_share DECIMAL(30,18) NOT NULL DEFAULT 0,
    price_last_updated_by VARCHAR(255),
    price_last_updated_at TIMESTAMPTZ,
    price_update_notes TEXT,

    -- Configuration
    min_deposit_amount DECIMAL(30,18) NOT NULL DEFAULT 0,
    max_deposit_amount DECIMAL(30,18),
    min_withdrawal_amount DECIMAL(30,18) NOT NULL DEFAULT 0,
    is_deposit_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    is_withdrawal_allowed BOOLEAN NOT NULL DEFAULT TRUE,

    -- Performance tracking
    inception_date TIMESTAMPTZ NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL,

    -- Metadata
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault assets table for individual positions within vaults
CREATE TABLE IF NOT EXISTS vault_assets (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    asset VARCHAR(50) NOT NULL,
    account VARCHAR(100) NOT NULL,

    -- Position information
    quantity DECIMAL(30,18) NOT NULL DEFAULT 0,
    avg_cost_basis DECIMAL(30,18) NOT NULL DEFAULT 0,
    current_price DECIMAL(30,18) NOT NULL DEFAULT 0,
    current_market_value DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Allocation settings
    target_allocation DECIMAL(5,4),
    min_allocation DECIMAL(5,4),
    max_allocation DECIMAL(5,4),
    is_rebalancing BOOLEAN NOT NULL DEFAULT FALSE,

    -- Performance tracking
    unrealized_pnl DECIMAL(30,18) NOT NULL DEFAULT 0,
    unrealized_pnl_percent DECIMAL(30,18) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Transaction tracking
    total_bought DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_sold DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_cost DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_proceeds DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Yield and income tracking
    income_received DECIMAL(30,18) NOT NULL DEFAULT 0,
    yield_rate DECIMAL(8,8),

    -- Metadata
    first_acquired_date TIMESTAMPTZ,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault shares table for user ownership in vaults
CREATE TABLE IF NOT EXISTS vault_shares (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,

    -- Share information
    share_balance DECIMAL(30,18) NOT NULL DEFAULT 0,
    cost_basis DECIMAL(30,18) NOT NULL DEFAULT 0,
    avg_cost_per_share DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Transaction tracking
    total_deposits DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_withdrawals DECIMAL(30,18) NOT NULL DEFAULT 0,
    net_deposits DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Performance metrics
    current_market_value DECIMAL(30,18) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(30,18) NOT NULL DEFAULT 0,
    unrealized_pnl_percent DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Realized P&L from share transactions
    realized_pnl DECIMAL(30,18) NOT NULL DEFAULT 0,
    realized_pnl_percent DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Fee tracking
    fees_paid DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Metadata
    first_deposit_date TIMESTAMPTZ,
    last_activity_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault transactions table for all vault-related operations
CREATE TABLE IF NOT EXISTS vault_transactions (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),

    -- Transaction details
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Financial amounts
    amount_usd DECIMAL(30,18) NOT NULL,
    shares DECIMAL(30,18) NOT NULL DEFAULT 0,
    price_per_share DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Asset information (for rebalancing and asset-specific transactions)
    asset VARCHAR(50),
    account VARCHAR(100),
    asset_quantity DECIMAL(30,18) NOT NULL DEFAULT 0,
    asset_price DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Fee information
    fee_amount DECIMAL(30,18) NOT NULL DEFAULT 0,
    fee_type VARCHAR(20),
    fee_rate DECIMAL(8,8) NOT NULL DEFAULT 0,

    -- Price and valuation information
    vault_aum_before DECIMAL(30,18) NOT NULL DEFAULT 0,
    vault_aum_after DECIMAL(30,18) NOT NULL DEFAULT 0,
    share_price_before DECIMAL(30,18) NOT NULL DEFAULT 0,
    share_price_after DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- User balance snapshots
    user_shares_before DECIMAL(30,18) NOT NULL DEFAULT 0,
    user_shares_after DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Metadata
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    transaction_hash VARCHAR(255),
    external_tx_id VARCHAR(255),
    notes TEXT,

    -- Audit fields
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault performance table for tracking performance over time
CREATE TABLE IF NOT EXISTS vault_performance (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,

    -- Time period
    period VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Performance metrics
    starting_aum DECIMAL(30,18) NOT NULL DEFAULT 0,
    ending_aum DECIMAL(30,18) NOT NULL DEFAULT 0,
    starting_share_price DECIMAL(30,18) NOT NULL DEFAULT 0,
    ending_share_price DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Returns
    total_return DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_return_pct DECIMAL(10,8) NOT NULL DEFAULT 0,
    annualized_return DECIMAL(10,8) NOT NULL DEFAULT 0,

    -- Volatility and risk metrics
    volatility DECIMAL(10,8) NOT NULL DEFAULT 0,
    max_drawdown DECIMAL(10,8) NOT NULL DEFAULT 0,
    sharpe_ratio DECIMAL(10,8) NOT NULL DEFAULT 0,

    -- Activity metrics
    net_deposits DECIMAL(30,18) NOT NULL DEFAULT 0,
    total_fees DECIMAL(30,18) NOT NULL DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vault share history table for tracking all share transactions
CREATE TABLE IF NOT EXISTS vault_share_history (
    id VARCHAR(255) PRIMARY KEY,
    vault_share_id VARCHAR(255) NOT NULL,
    vault_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,

    -- Transaction details
    type VARCHAR(20) NOT NULL,
    shares DECIMAL(30,18) NOT NULL,
    price_per_share DECIMAL(30,18) NOT NULL,
    total_amount DECIMAL(30,18) NOT NULL,

    -- Fee information
    fee_amount DECIMAL(30,18) NOT NULL DEFAULT 0,
    fee_type VARCHAR(20),

    -- Balance snapshot
    balance_before DECIMAL(30,18) NOT NULL,
    balance_after DECIMAL(30,18) NOT NULL,

    -- Metadata
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_hash VARCHAR(255),
    notes TEXT
);

-- Create indexes for performance optimization

-- Vaults table indexes
CREATE INDEX IF NOT EXISTS idx_vaults_type ON vaults(type);
CREATE INDEX IF NOT EXISTS idx_vaults_status ON vaults(status);
CREATE INDEX IF NOT EXISTS idx_vaults_token_symbol ON vaults(token_symbol);
CREATE INDEX IF NOT EXISTS idx_vaults_created_by ON vaults(created_by);
CREATE INDEX IF NOT EXISTS idx_vaults_inception_date ON vaults(inception_date);
CREATE INDEX IF NOT EXISTS idx_vaults_last_updated ON vaults(last_updated);

-- Vault assets table indexes
CREATE INDEX IF NOT EXISTS idx_vault_assets_vault_id ON vault_assets(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_assets_asset ON vault_assets(asset);
CREATE INDEX IF NOT EXISTS idx_vault_assets_account ON vault_assets(account);
CREATE INDEX IF NOT EXISTS idx_vault_assets_vault_asset ON vault_assets(vault_id, asset);
CREATE INDEX IF NOT EXISTS idx_vault_assets_first_acquired ON vault_assets(first_acquired_date);
CREATE INDEX IF NOT EXISTS idx_vault_assets_last_updated ON vault_assets(last_updated);

-- Vault shares table indexes
CREATE INDEX IF NOT EXISTS idx_vault_shares_vault_id ON vault_shares(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_shares_user_id ON vault_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_shares_vault_user ON vault_shares(vault_id, user_id);
CREATE INDEX IF NOT EXISTS idx_vault_shares_first_deposit ON vault_shares(first_deposit_date);
CREATE INDEX IF NOT EXISTS idx_vault_shares_last_activity ON vault_shares(last_activity_date);

-- Vault transactions table indexes
CREATE INDEX IF NOT EXISTS idx_vault_transactions_vault_id ON vault_transactions(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_user_id ON vault_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_type ON vault_transactions(type);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_status ON vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_timestamp ON vault_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_executed_at ON vault_transactions(executed_at);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_asset ON vault_transactions(asset);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_vault_type ON vault_transactions(vault_id, type);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_vault_user ON vault_transactions(vault_id, user_id);

-- Vault performance table indexes
CREATE INDEX IF NOT EXISTS idx_vault_performance_vault_id ON vault_performance(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_performance_period ON vault_performance(period);
CREATE INDEX IF NOT EXISTS idx_vault_performance_period_start ON vault_performance(period_start);
CREATE INDEX IF NOT EXISTS idx_vault_performance_period_end ON vault_performance(period_end);
CREATE INDEX IF NOT EXISTS idx_vault_performance_vault_period ON vault_performance(vault_id, period);

-- Vault share history table indexes
CREATE INDEX IF NOT EXISTS idx_vault_share_history_vault_share_id ON vault_share_history(vault_share_id);
CREATE INDEX IF NOT EXISTS idx_vault_share_history_vault_id ON vault_share_history(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_share_history_user_id ON vault_share_history(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_share_history_timestamp ON vault_share_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_vault_share_history_type ON vault_share_history(type);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
DO $$
BEGIN
    -- Vaults table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vaults_updated_at') THEN
        CREATE TRIGGER update_vaults_updated_at
            BEFORE UPDATE ON vaults
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Vault assets table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vault_assets_updated_at') THEN
        CREATE TRIGGER update_vault_assets_updated_at
            BEFORE UPDATE ON vault_assets
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Vault shares table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vault_shares_updated_at') THEN
        CREATE TRIGGER update_vault_shares_updated_at
            BEFORE UPDATE ON vault_shares
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Vault transactions table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vault_transactions_updated_at') THEN
        CREATE TRIGGER update_vault_transactions_updated_at
            BEFORE UPDATE ON vault_transactions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- Vault performance table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vault_performance_updated_at') THEN
        CREATE TRIGGER update_vault_performance_updated_at
            BEFORE UPDATE ON vault_performance
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;