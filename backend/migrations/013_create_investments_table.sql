-- Create investments table for enhanced investment tracking
-- This migration supports multiple deposits per investment while maintaining backward compatibility

-- Create investments table
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset VARCHAR(10) NOT NULL,
    account VARCHAR(100) NOT NULL,
    horizon VARCHAR(20), -- 'short-term', 'long-term'

    -- Aggregated deposit information
    deposit_date DATE NOT NULL,
    deposit_qty DECIMAL(20,8) NOT NULL,
    deposit_cost DECIMAL(20,2) NOT NULL,
    deposit_unit_cost DECIMAL(20,8) NOT NULL,

    -- Withdrawal information (if closed)
    withdrawal_date DATE,
    withdrawal_qty DECIMAL(20,8) DEFAULT 0,
    withdrawal_value DECIMAL(20,2) DEFAULT 0,
    withdrawal_unit_price DECIMAL(20,8) DEFAULT 0,

    -- P&L calculation
    pnl DECIMAL(20,2) DEFAULT 0,
    pnl_percent DECIMAL(20,2) DEFAULT 0,

    -- Status and quantities
    is_open BOOLEAN DEFAULT TRUE,
    remaining_qty DECIMAL(20,8) NOT NULL,

    -- Configuration
    cost_basis_method VARCHAR(20) NOT NULL DEFAULT 'fifo',

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT check_investment_horizon CHECK (horizon IN ('short-term', 'long-term') OR horizon IS NULL),
    CONSTRAINT check_cost_basis_method CHECK (cost_basis_method IN ('fifo', 'lifo', 'average')),
    CONSTRAINT check_deposit_qty_positive CHECK (deposit_qty > 0),
    CONSTRAINT check_deposit_cost_non_negative CHECK (deposit_cost >= 0),
    CONSTRAINT check_withdrawal_qty_non_negative CHECK (withdrawal_qty >= 0)
);

-- Add investment_id column to transactions table for enhanced tracking
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS investment_id UUID REFERENCES investments(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_investments_asset_account ON investments(asset, account);
CREATE INDEX IF NOT EXISTS idx_investments_is_open ON investments(is_open);
CREATE INDEX IF NOT EXISTS idx_investments_deposit_date ON investments(deposit_date);
CREATE INDEX IF NOT EXISTS idx_investments_horizon ON investments(horizon);

CREATE INDEX IF NOT EXISTS idx_transactions_investment_id ON transactions(investment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_investment_asset_account ON transactions(investment_id, asset, account);

-- Add trigger for updated_at on investments table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_investments_updated_at') THEN
        CREATE TRIGGER update_investments_updated_at
            BEFORE UPDATE ON investments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE investments IS 'Tracks investment positions with aggregated deposit/withdrawal information and P&L calculations';
COMMENT ON COLUMN investments.id IS 'Unique identifier for the investment position';
COMMENT ON COLUMN investments.asset IS 'Asset symbol (e.g., BTC, USDT)';
COMMENT ON COLUMN investments.account IS 'Account where investment is held';
COMMENT ON COLUMN investments.horizon IS 'Investment horizon: short-term or long-term';
COMMENT ON COLUMN investments.deposit_date IS 'Date of first deposit for this investment';
COMMENT ON COLUMN investments.deposit_qty IS 'Total quantity deposited across all deposits';
COMMENT ON COLUMN investments.deposit_cost IS 'Total cost in USD across all deposits';
COMMENT ON COLUMN investments.deposit_unit_cost IS 'Weighted average unit cost across all deposits';
COMMENT ON COLUMN investments.withdrawal_date IS 'Date when investment was fully closed';
COMMENT ON COLUMN investments.withdrawal_qty IS 'Total quantity withdrawn';
COMMENT ON COLUMN investments.withdrawal_value IS 'Total USD value received from withdrawals';
COMMENT ON COLUMN investments.withdrawal_unit_price IS 'Average unit price of withdrawals';
COMMENT ON COLUMN investments.pnl IS 'Realized + unrealized profit and loss in USD';
COMMENT ON COLUMN investments.pnl_percent IS 'Profit and loss as percentage of total cost';
COMMENT ON COLUMN investments.is_open IS 'Whether investment position is still open';
COMMENT ON COLUMN investments.remaining_qty IS 'Remaining quantity after withdrawals';
COMMENT ON COLUMN investments.cost_basis_method IS 'Cost basis calculation method: fifo, lifo, or average';

COMMENT ON COLUMN transactions.investment_id IS 'Optional link to investment position for enhanced tracking (maintains compatibility with existing deposit_id)';