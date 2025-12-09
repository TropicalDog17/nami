-- Migration 025: Consolidated Transaction-Based Vault System
-- Combines:
--   - Transaction-based vault architecture (022)
--   - Seed data with transaction history (023)
--   - Ledger correctness hardening with immutability (024)
-- 
-- This migration ensures:
--   1. All vault state is derived from vault_transactions (immutable ledger)
--   2. Automatic recalculation of holdings from transaction history
--   3. Enforced invariants and constraints for data integrity
--   4. Sample data for testing and development

BEGIN;

-- ============================================================================
-- PHASE 1: Schema Extensions for Transaction-Based Architecture
-- ============================================================================

-- Add transaction-based tracking columns to vault_transactions
ALTER TABLE vault_transactions 
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS related_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reversal_of_id VARCHAR(255);

-- Create indexes for transaction-based queries
CREATE INDEX IF NOT EXISTS idx_vault_transactions_related_tx ON vault_transactions(related_transaction_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_is_reversal ON vault_transactions(is_reversal);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_reversal_of ON vault_transactions(reversal_of_id);

-- Add columns to vault_shares to track transaction-based state
ALTER TABLE vault_shares
ADD COLUMN IF NOT EXISTS transaction_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_derived BOOLEAN NOT NULL DEFAULT TRUE;

-- Create indexes for vault_shares transaction tracking
CREATE INDEX IF NOT EXISTS idx_vault_shares_last_transaction ON vault_shares(last_transaction_id);
CREATE INDEX IF NOT EXISTS idx_vault_shares_is_derived ON vault_shares(is_derived);

-- Add columns to vault_assets to track transaction-based state
ALTER TABLE vault_assets
ADD COLUMN IF NOT EXISTS transaction_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_derived BOOLEAN NOT NULL DEFAULT TRUE;

-- Create indexes for vault_assets transaction tracking
CREATE INDEX IF NOT EXISTS idx_vault_assets_last_transaction ON vault_assets(last_transaction_id);
CREATE INDEX IF NOT EXISTS idx_vault_assets_is_derived ON vault_assets(is_derived);

-- Add columns to vaults to track transaction-based state
ALTER TABLE vaults
ADD COLUMN IF NOT EXISTS last_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS transaction_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_derived BOOLEAN NOT NULL DEFAULT TRUE;

-- Create indexes for vaults transaction tracking
CREATE INDEX IF NOT EXISTS idx_vaults_last_transaction ON vaults(last_transaction_id);
CREATE INDEX IF NOT EXISTS idx_vaults_is_derived ON vaults(is_derived);

-- ============================================================================
-- PHASE 2: Ledger Correctness - Immutability and Invariants
-- ============================================================================

-- Enforce immutability: disallow UPDATE and DELETE on vault_transactions
CREATE OR REPLACE FUNCTION prevent_mutation_on_vault_transactions()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'vault_transactions is immutable; create a reversal transaction instead'
        USING ERRCODE = 'integrity_constraint_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if any to avoid duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vt_prevent_update') THEN
        DROP TRIGGER trg_vt_prevent_update ON vault_transactions;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vt_prevent_delete') THEN
        DROP TRIGGER trg_vt_prevent_delete ON vault_transactions;
    END IF;
END; $$;

CREATE TRIGGER trg_vt_prevent_update
    BEFORE UPDATE ON vault_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_vault_transactions();

CREATE TRIGGER trg_vt_prevent_delete
    BEFORE DELETE ON vault_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_vault_transactions();

-- Reversal integrity: FK + unique-one-reversal
ALTER TABLE vault_transactions
    ADD CONSTRAINT fk_vt_reversal_of
    FOREIGN KEY (reversal_of_id) REFERENCES vault_transactions(id);

-- One reversal per original txn
CREATE UNIQUE INDEX ux_vt_one_reversal
    ON vault_transactions(reversal_of_id)
    WHERE is_reversal = TRUE;

-- Non-negative numeric invariants (money and quantities)
ALTER TABLE vault_transactions
    ADD CONSTRAINT ck_vt_amount_usd_nonneg CHECK (amount_usd >= 0),
    ADD CONSTRAINT ck_vt_shares_nonneg CHECK (shares >= 0),
    ADD CONSTRAINT ck_vt_price_per_share_nonneg CHECK (price_per_share >= 0),
    ADD CONSTRAINT ck_vt_fee_amount_nonneg CHECK (fee_amount >= 0),
    ADD CONSTRAINT ck_vt_fee_rate_nonneg CHECK (fee_rate >= 0);

-- Type-specific requirements using column "type"
-- Require user_id for deposit/withdrawal/mint_shares/burn_shares
ALTER TABLE vault_transactions
    ADD CONSTRAINT ck_vt_user_id_required
    CHECK (
        ("type" IN ('deposit','withdrawal','mint_shares','burn_shares') AND user_id IS NOT NULL)
        OR ("type" NOT IN ('deposit','withdrawal','mint_shares','burn_shares'))
    );

-- Require positive shares for mint/burn, positive amount for deposit/withdrawal when provided
ALTER TABLE vault_transactions
    ADD CONSTRAINT ck_vt_mint_burn_shares_positive
    CHECK (
        ("type" IN ('mint_shares','burn_shares') AND shares > 0)
        OR ("type" NOT IN ('mint_shares','burn_shares'))
    );

ALTER TABLE vault_transactions
    ADD CONSTRAINT ck_vt_deposit_withdraw_amount_positive
    CHECK (
        ("type" IN ('deposit','withdrawal') AND amount_usd > 0)
        OR ("type" NOT IN ('deposit','withdrawal'))
    );

-- ============================================================================
-- PHASE 3: Derived State Views
-- ============================================================================

-- Create a view for vault holdings derived from transactions
CREATE OR REPLACE VIEW vault_holdings_view AS
SELECT 
    v.id as vault_id,
    v.name as vault_name,
    v.token_symbol,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'mint_shares', 'yield', 'income') THEN vt.shares
        WHEN vt.type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -vt.shares
        ELSE 0
    END), 0) as total_shares_outstanding,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'mint_shares', 'yield', 'income') THEN vt.amount_usd
        WHEN vt.type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -vt.amount_usd
        ELSE 0
    END), 0) as total_aum,
    COUNT(vt.id) as transaction_count,
    MAX(vt.timestamp) as last_transaction_at,
    MAX(vt.id) as last_transaction_id
FROM vaults v
LEFT JOIN vault_transactions vt ON v.id = vt.vault_id AND vt.is_reversal = FALSE
GROUP BY v.id, v.name, v.token_symbol;

-- Create a view for user vault holdings derived from transactions
CREATE OR REPLACE VIEW user_vault_holdings_view AS
SELECT 
    vs.vault_id,
    vs.user_id,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'mint_shares', 'yield', 'income') THEN vt.shares
        WHEN vt.type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -vt.shares
        ELSE 0
    END), 0) as share_balance,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'mint_shares') THEN vt.amount_usd
        WHEN vt.type IN ('withdrawal', 'burn_shares') THEN -vt.amount_usd
        ELSE 0
    END), 0) as net_deposits,
    COALESCE(SUM(CASE 
        WHEN vt.type = 'fee' THEN vt.fee_amount
        ELSE 0
    END), 0) as total_fees_paid,
    COUNT(vt.id) as transaction_count,
    MAX(vt.timestamp) as last_activity_date,
    MAX(vt.id) as last_transaction_id
FROM vault_shares vs
LEFT JOIN vault_transactions vt ON vs.vault_id = vt.vault_id AND vs.user_id = vt.user_id AND vt.is_reversal = FALSE
GROUP BY vs.vault_id, vs.user_id;

-- Create a view for vault asset holdings derived from transactions
CREATE OR REPLACE VIEW vault_asset_holdings_view AS
SELECT 
    va.vault_id,
    va.asset,
    va.account,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'income', 'yield') THEN vt.asset_quantity
        WHEN vt.type IN ('withdrawal', 'expense', 'fee') THEN -vt.asset_quantity
        ELSE 0
    END), 0) as total_quantity,
    COALESCE(SUM(CASE 
        WHEN vt.type IN ('deposit', 'income', 'yield') THEN vt.asset_quantity * vt.asset_price
        WHEN vt.type IN ('withdrawal', 'expense', 'fee') THEN -(vt.asset_quantity * vt.asset_price)
        ELSE 0
    END), 0) as total_value,
    COUNT(vt.id) as transaction_count,
    MAX(vt.timestamp) as last_transaction_at,
    MAX(vt.id) as last_transaction_id
FROM vault_assets va
LEFT JOIN vault_transactions vt ON va.vault_id = vt.vault_id AND va.asset = vt.asset AND va.account = vt.account AND vt.is_reversal = FALSE
GROUP BY va.vault_id, va.asset, va.account;

-- ============================================================================
-- PHASE 4: Recalculation Functions with Advisory Locking
-- ============================================================================

-- Create function to recalculate vault state from transactions
CREATE OR REPLACE FUNCTION recalculate_vault_from_transactions(p_vault_id VARCHAR(255))
RETURNS TABLE (
    vault_id VARCHAR(255),
    total_shares DECIMAL,
    total_aum DECIMAL,
    share_price DECIMAL,
    transaction_count INTEGER,
    last_transaction_id VARCHAR(255)
) AS $$
DECLARE
    v_total_shares DECIMAL;
    v_total_aum DECIMAL;
    v_share_price DECIMAL;
    v_transaction_count INTEGER;
    v_last_transaction_id VARCHAR(255);
BEGIN
    -- Per-vault lock to serialize updates
    PERFORM pg_advisory_xact_lock(hashtext(p_vault_id));

    -- Calculate totals from transactions
    SELECT 
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'mint_shares', 'yield', 'income') THEN shares
            WHEN "type" IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -shares
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'mint_shares', 'yield', 'income') THEN amount_usd
            WHEN "type" IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -amount_usd
            ELSE 0
        END), 0),
        COUNT(*),
        MAX(id)
    INTO v_total_shares, v_total_aum, v_transaction_count, v_last_transaction_id
    FROM vault_transactions
    WHERE vault_id = p_vault_id AND is_reversal = FALSE;

    -- Calculate share price
    IF v_total_shares > 0 THEN
        v_share_price := v_total_aum / v_total_shares;
    ELSE
        v_share_price := 1;
    END IF;

    -- Update vault with calculated values
    UPDATE vaults
    SET 
        total_supply = v_total_shares,
        total_assets_under_management = v_total_aum,
        current_share_price = v_share_price,
        last_transaction_id = v_last_transaction_id,
        transaction_count = v_transaction_count,
        is_derived = TRUE,
        last_updated = NOW()
    WHERE id = p_vault_id;

    RETURN QUERY
    SELECT 
        p_vault_id,
        v_total_shares,
        v_total_aum,
        v_share_price,
        v_transaction_count,
        v_last_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to recalculate user vault holdings from transactions
CREATE OR REPLACE FUNCTION recalculate_user_vault_holdings(p_vault_id VARCHAR(255), p_user_id VARCHAR(255))
RETURNS TABLE (
    vault_id VARCHAR(255),
    user_id VARCHAR(255),
    share_balance DECIMAL,
    net_deposits DECIMAL,
    total_fees_paid DECIMAL,
    transaction_count INTEGER,
    last_transaction_id VARCHAR(255)
) AS $$
DECLARE
    v_share_balance DECIMAL;
    v_net_deposits DECIMAL;
    v_total_fees_paid DECIMAL;
    v_transaction_count INTEGER;
    v_last_transaction_id VARCHAR(255);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_vault_id));

    -- Calculate holdings from transactions
    SELECT 
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'mint_shares', 'yield', 'income') THEN shares
            WHEN "type" IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -shares
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'mint_shares') THEN amount_usd
            WHEN "type" IN ('withdrawal', 'burn_shares') THEN -amount_usd
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE 
            WHEN "type" = 'fee' THEN fee_amount
            ELSE 0
        END), 0),
        COUNT(*),
        MAX(id)
    INTO v_share_balance, v_net_deposits, v_total_fees_paid, v_transaction_count, v_last_transaction_id
    FROM vault_transactions
    WHERE vault_id = p_vault_id AND user_id = p_user_id AND is_reversal = FALSE;

    -- Update vault_shares with calculated values
    UPDATE vault_shares
    SET 
        share_balance = v_share_balance,
        net_deposits = v_net_deposits,
        fees_paid = v_total_fees_paid,
        transaction_count = v_transaction_count,
        last_transaction_id = v_last_transaction_id,
        is_derived = TRUE,
        last_activity_date = NOW(),
        updated_at = NOW()
    WHERE vault_id = p_vault_id AND user_id = p_user_id;

    RETURN QUERY
    SELECT 
        p_vault_id,
        p_user_id,
        v_share_balance,
        v_net_deposits,
        v_total_fees_paid,
        v_transaction_count,
        v_last_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to recalculate vault asset holdings from transactions
CREATE OR REPLACE FUNCTION recalculate_vault_asset_holdings(p_vault_id VARCHAR(255), p_asset VARCHAR(50), p_account VARCHAR(100))
RETURNS TABLE (
    vault_id VARCHAR(255),
    asset VARCHAR(50),
    account VARCHAR(100),
    total_quantity DECIMAL,
    total_value DECIMAL,
    transaction_count INTEGER,
    last_transaction_id VARCHAR(255)
) AS $$
DECLARE
    v_total_quantity DECIMAL;
    v_total_value DECIMAL;
    v_transaction_count INTEGER;
    v_last_transaction_id VARCHAR(255);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_vault_id));

    -- Calculate holdings from transactions
    SELECT 
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'income', 'yield') THEN asset_quantity
            WHEN "type" IN ('withdrawal', 'expense', 'fee') THEN -asset_quantity
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE 
            WHEN "type" IN ('deposit', 'income', 'yield') THEN asset_quantity * asset_price
            WHEN "type" IN ('withdrawal', 'expense', 'fee') THEN -(asset_quantity * asset_price)
            ELSE 0
        END), 0),
        COUNT(*),
        MAX(id)
    INTO v_total_quantity, v_total_value, v_transaction_count, v_last_transaction_id
    FROM vault_transactions
    WHERE vault_id = p_vault_id AND asset = p_asset AND account = p_account AND is_reversal = FALSE;

    -- Update vault_assets with calculated values
    UPDATE vault_assets
    SET 
        quantity = v_total_quantity,
        current_market_value = v_total_value,
        transaction_count = v_transaction_count,
        last_transaction_id = v_last_transaction_id,
        is_derived = TRUE,
        last_updated = NOW(),
        updated_at = NOW()
    WHERE vault_id = p_vault_id AND asset = p_asset AND account = p_account;

    RETURN QUERY
    SELECT 
        p_vault_id,
        p_asset,
        p_account,
        v_total_quantity,
        v_total_value,
        v_transaction_count,
        v_last_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 5: Automatic Recalculation Trigger
-- ============================================================================

-- Create trigger to automatically recalculate vault state after transaction insert
CREATE OR REPLACE FUNCTION trigger_recalculate_vault_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.vault_id));

    -- Recalculate vault totals
    PERFORM recalculate_vault_from_transactions(NEW.vault_id);
    
    -- Recalculate user holdings if user_id is provided
    IF NEW.user_id IS NOT NULL THEN
        PERFORM recalculate_user_vault_holdings(NEW.vault_id, NEW.user_id);
    END IF;
    
    -- Recalculate asset holdings if asset is provided
    IF NEW.asset IS NOT NULL AND NEW.account IS NOT NULL THEN
        PERFORM recalculate_vault_asset_holdings(NEW.vault_id, NEW.asset, NEW.account);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vault_transaction_recalculate') THEN
        DROP TRIGGER trigger_vault_transaction_recalculate ON vault_transactions;
    END IF;
END $$;

-- Create trigger on vault_transactions
CREATE TRIGGER trigger_vault_transaction_recalculate
    AFTER INSERT ON vault_transactions
    FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_vault_on_transaction();

-- ============================================================================
-- PHASE 6: Documentation Comments
-- ============================================================================

COMMENT ON TABLE vault_transactions IS 'Immutable transaction-based ledger for all vault operations. All vault state (holdings, balances, AUM) is derived from this table. Updates and deletes are prevented; use reversals instead.';
COMMENT ON COLUMN vault_transactions.is_reversal IS 'Flag indicating if this transaction is a reversal of another transaction';
COMMENT ON COLUMN vault_transactions.reversal_of_id IS 'Reference to the transaction being reversed, if applicable';
COMMENT ON VIEW vault_holdings_view IS 'Derived view showing total vault holdings calculated from vault_transactions';
COMMENT ON VIEW user_vault_holdings_view IS 'Derived view showing user-specific vault holdings calculated from vault_transactions';
COMMENT ON VIEW vault_asset_holdings_view IS 'Derived view showing vault asset holdings calculated from vault_transactions';

-- ============================================================================
-- PHASE 7: Seed Data - Sample Vaults and Transactions
-- ============================================================================

-- Create sample vaults
INSERT INTO vaults (
    id, name, description, type, status,
    token_symbol, token_decimals, total_supply,
    total_assets_under_management, current_share_price, initial_share_price,
    is_user_defined_price, manual_price_per_share,
    min_deposit_amount, is_deposit_allowed, is_withdrawal_allowed,
    inception_date, last_updated, created_by
) VALUES
(
    'vault-001',
    'Bitcoin Holding Vault',
    'Long-term Bitcoin investment vault',
    'single_asset',
    'active',
    'BTC-VAULT',
    18,
    0, -- Will be calculated from transactions
    0, -- Will be calculated from transactions
    1.0,
    1.0,
    FALSE,
    0,
    0.01,
    TRUE,
    TRUE,
    NOW() - INTERVAL '1 year',
    NOW(),
    'system'
),
(
    'vault-002',
    'Ethereum Holding Vault',
    'Long-term Ethereum investment vault',
    'single_asset',
    'active',
    'ETH-VAULT',
    18,
    0,
    0,
    1.0,
    1.0,
    FALSE,
    0,
    0.1,
    TRUE,
    TRUE,
    NOW() - INTERVAL '1 year',
    NOW(),
    'system'
),
(
    'vault-003',
    'Stablecoin Yield Vault',
    'USDT yield farming vault',
    'yield_farming',
    'active',
    'USDT-YIELD',
    18,
    0,
    0,
    1.0,
    1.0,
    FALSE,
    0,
    100,
    TRUE,
    TRUE,
    NOW() - INTERVAL '6 months',
    NOW(),
    'system'
),
(
    'vault-004',
    'Multi-Asset Portfolio',
    'Diversified crypto portfolio',
    'multi_asset',
    'active',
    'PORTFOLIO',
    18,
    0,
    0,
    1.0,
    1.0,
    FALSE,
    0,
    500,
    TRUE,
    TRUE,
    NOW() - INTERVAL '6 months',
    NOW(),
    'system'
)
ON CONFLICT (id) DO NOTHING;

-- Create vault assets for each vault
INSERT INTO vault_assets (
    id, vault_id, asset, account,
    quantity, avg_cost_basis, current_price, current_market_value,
    target_allocation, is_rebalancing,
    unrealized_pnl, unrealized_pnl_percent, realized_pnl,
    total_bought, total_sold, total_cost, total_proceeds,
    income_received, first_acquired_date, last_updated, created_at
) VALUES
-- Bitcoin Vault Assets
(
    'vault-asset-001',
    'vault-001',
    'BTC',
    'Binance Spot',
    0, 45000, 65000, 0,
    1.0, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '1 year', NOW(), NOW()
),
-- Ethereum Vault Assets
(
    'vault-asset-002',
    'vault-002',
    'ETH',
    'Binance Spot',
    0, 2500, 3500, 0,
    1.0, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '1 year', NOW(), NOW()
),
-- Stablecoin Vault Assets
(
    'vault-asset-003',
    'vault-003',
    'USDT',
    'Kyberswap',
    0, 1, 1, 0,
    1.0, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
-- Multi-Asset Vault Assets
(
    'vault-asset-004',
    'vault-004',
    'BTC',
    'Binance Spot',
    0, 45000, 65000, 0,
    0.4, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
(
    'vault-asset-005',
    'vault-004',
    'ETH',
    'Binance Spot',
    0, 2500, 3500, 0,
    0.4, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
(
    'vault-asset-006',
    'vault-004',
    'USDT',
    'Kyberswap',
    0, 1, 1, 0,
    0.2, FALSE,
    0, 0, 0,
    0, 0, 0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create vault shares for users
INSERT INTO vault_shares (
    id, vault_id, user_id,
    share_balance, cost_basis, avg_cost_per_share,
    total_deposits, total_withdrawals, net_deposits,
    current_market_value, unrealized_pnl, unrealized_pnl_percent,
    realized_pnl, realized_pnl_percent,
    fees_paid, first_deposit_date, last_activity_date, created_at
) VALUES
-- Bitcoin Vault Users
(
    'vault-share-001',
    'vault-001',
    'user-001',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '1 year', NOW(), NOW()
),
(
    'vault-share-002',
    'vault-001',
    'user-002',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '8 months', NOW(), NOW()
),
-- Ethereum Vault Users
(
    'vault-share-003',
    'vault-002',
    'user-001',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '1 year', NOW(), NOW()
),
(
    'vault-share-004',
    'vault-002',
    'user-003',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
-- Stablecoin Vault Users
(
    'vault-share-005',
    'vault-003',
    'user-001',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
(
    'vault-share-006',
    'vault-003',
    'user-004',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '4 months', NOW(), NOW()
),
-- Multi-Asset Vault Users
(
    'vault-share-007',
    'vault-004',
    'user-001',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '6 months', NOW(), NOW()
),
(
    'vault-share-008',
    'vault-004',
    'user-002',
    0, 0, 1.0,
    0, 0, 0,
    0, 0, 0,
    0, 0,
    0, NOW() - INTERVAL '5 months', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create transaction history for Bitcoin Vault
-- Initial deposit from user-001: 0.5 BTC at $45,000 = $22,500
INSERT INTO vault_transactions (
    id, vault_id, user_id, type, status,
    amount_usd, shares, price_per_share,
    asset, account, asset_quantity, asset_price,
    fee_amount, fee_type, fee_rate,
    vault_aum_before, vault_aum_after,
    share_price_before, share_price_after,
    user_shares_before, user_shares_after,
    timestamp, created_by, transaction_type, is_reversal
) VALUES
(
    'vault-tx-001',
    'vault-001',
    'user-001',
    'deposit',
    'executed',
    22500, 22500, 1.0,
    'BTC', 'Binance Spot', 0.5, 45000,
    0, NULL, 0,
    0, 22500,
    1.0, 1.0,
    0, 22500,
    NOW() - INTERVAL '1 year',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-002',
    'vault-001',
    'user-001',
    'mint_shares',
    'executed',
    22500, 22500, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    0, 22500,
    1.0, 1.0,
    0, 22500,
    NOW() - INTERVAL '1 year',
    'system',
    'mint_shares',
    FALSE
),
-- Deposit from user-002: 0.3 BTC at $48,000 = $14,400
(
    'vault-tx-003',
    'vault-001',
    'user-002',
    'deposit',
    'executed',
    14400, 14400, 1.0,
    'BTC', 'Binance Spot', 0.3, 48000,
    0, NULL, 0,
    22500, 36900,
    1.0, 1.0,
    0, 14400,
    NOW() - INTERVAL '8 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-004',
    'vault-001',
    'user-002',
    'mint_shares',
    'executed',
    14400, 14400, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    22500, 36900,
    1.0, 1.0,
    0, 14400,
    NOW() - INTERVAL '8 months',
    'system',
    'mint_shares',
    FALSE
),
-- Valuation update: BTC price increased to $65,000
(
    'vault-tx-005',
    'vault-001',
    NULL,
    'valuation',
    'executed',
    0, 0, 1.0,
    'BTC', 'Binance Spot', 0.8, 65000,
    0, NULL, 0,
    36900, 52000,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '2 months',
    'system',
    'valuation',
    FALSE
),
-- Yield income: 0.02 BTC at $65,000 = $1,300
(
    'vault-tx-006',
    'vault-001',
    NULL,
    'yield',
    'executed',
    1300, 0, 1.0,
    'BTC', 'Binance Spot', 0.02, 65000,
    0, NULL, 0,
    52000, 53300,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 month',
    'system',
    'yield',
    FALSE
),
-- Management fee: 0.5% of AUM = $266.50
(
    'vault-tx-007',
    'vault-001',
    NULL,
    'fee',
    'executed',
    266.50, 0, 1.0,
    NULL, NULL, 0, 0,
    266.50, 'management', 0.005,
    53300, 53033.50,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 week',
    'system',
    'fee',
    FALSE
);

-- Create transaction history for Ethereum Vault
-- Initial deposit from user-001: 5 ETH at $2,500 = $12,500
INSERT INTO vault_transactions (
    id, vault_id, user_id, type, status,
    amount_usd, shares, price_per_share,
    asset, account, asset_quantity, asset_price,
    fee_amount, fee_type, fee_rate,
    vault_aum_before, vault_aum_after,
    share_price_before, share_price_after,
    user_shares_before, user_shares_after,
    timestamp, created_by, transaction_type, is_reversal
) VALUES
(
    'vault-tx-008',
    'vault-002',
    'user-001',
    'deposit',
    'executed',
    12500, 12500, 1.0,
    'ETH', 'Binance Spot', 5, 2500,
    0, NULL, 0,
    0, 12500,
    1.0, 1.0,
    0, 12500,
    NOW() - INTERVAL '1 year',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-009',
    'vault-002',
    'user-001',
    'mint_shares',
    'executed',
    12500, 12500, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    0, 12500,
    1.0, 1.0,
    0, 12500,
    NOW() - INTERVAL '1 year',
    'system',
    'mint_shares',
    FALSE
),
-- Deposit from user-003: 8 ETH at $2,800 = $22,400
(
    'vault-tx-010',
    'vault-002',
    'user-003',
    'deposit',
    'executed',
    22400, 22400, 1.0,
    'ETH', 'Binance Spot', 8, 2800,
    0, NULL, 0,
    12500, 34900,
    1.0, 1.0,
    0, 22400,
    NOW() - INTERVAL '6 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-011',
    'vault-002',
    'user-003',
    'mint_shares',
    'executed',
    22400, 22400, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    12500, 34900,
    1.0, 1.0,
    0, 22400,
    NOW() - INTERVAL '6 months',
    'system',
    'mint_shares',
    FALSE
),
-- Valuation update: ETH price increased to $3,500
(
    'vault-tx-012',
    'vault-002',
    NULL,
    'valuation',
    'executed',
    0, 0, 1.0,
    'ETH', 'Binance Spot', 13, 3500,
    0, NULL, 0,
    34900, 45500,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '2 months',
    'system',
    'valuation',
    FALSE
),
-- Yield income: 0.5 ETH at $3,500 = $1,750
(
    'vault-tx-013',
    'vault-002',
    NULL,
    'yield',
    'executed',
    1750, 0, 1.0,
    'ETH', 'Binance Spot', 0.5, 3500,
    0, NULL, 0,
    45500, 47250,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 month',
    'system',
    'yield',
    FALSE
),
-- Management fee: 0.5% of AUM = $236.25
(
    'vault-tx-014',
    'vault-002',
    NULL,
    'fee',
    'executed',
    236.25, 0, 1.0,
    NULL, NULL, 0, 0,
    236.25, 'management', 0.005,
    47250, 47013.75,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 week',
    'system',
    'fee',
    FALSE
);

-- Create transaction history for Stablecoin Yield Vault
-- Initial deposit from user-001: $10,000 USDT
INSERT INTO vault_transactions (
    id, vault_id, user_id, type, status,
    amount_usd, shares, price_per_share,
    asset, account, asset_quantity, asset_price,
    fee_amount, fee_type, fee_rate,
    vault_aum_before, vault_aum_after,
    share_price_before, share_price_after,
    user_shares_before, user_shares_after,
    timestamp, created_by, transaction_type, is_reversal
) VALUES
(
    'vault-tx-015',
    'vault-003',
    'user-001',
    'deposit',
    'executed',
    10000, 10000, 1.0,
    'USDT', 'Kyberswap', 10000, 1,
    0, NULL, 0,
    0, 10000,
    1.0, 1.0,
    0, 10000,
    NOW() - INTERVAL '6 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-016',
    'vault-003',
    'user-001',
    'mint_shares',
    'executed',
    10000, 10000, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    0, 10000,
    1.0, 1.0,
    0, 10000,
    NOW() - INTERVAL '6 months',
    'system',
    'mint_shares',
    FALSE
),
-- Deposit from user-004: $15,000 USDT
(
    'vault-tx-017',
    'vault-003',
    'user-004',
    'deposit',
    'executed',
    15000, 15000, 1.0,
    'USDT', 'Kyberswap', 15000, 1,
    0, NULL, 0,
    10000, 25000,
    1.0, 1.0,
    0, 15000,
    NOW() - INTERVAL '4 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-018',
    'vault-003',
    'user-004',
    'mint_shares',
    'executed',
    15000, 15000, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    10000, 25000,
    1.0, 1.0,
    0, 15000,
    NOW() - INTERVAL '4 months',
    'system',
    'mint_shares',
    FALSE
),
-- Yield income: $500 from farming
(
    'vault-tx-019',
    'vault-003',
    NULL,
    'yield',
    'executed',
    500, 0, 1.0,
    'USDT', 'Kyberswap', 500, 1,
    0, NULL, 0,
    25000, 25500,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '2 months',
    'system',
    'yield',
    FALSE
),
-- Management fee: 1% of AUM = $255
(
    'vault-tx-020',
    'vault-003',
    NULL,
    'fee',
    'executed',
    255, 0, 1.0,
    NULL, NULL, 0, 0,
    255, 'management', 0.01,
    25500, 25245,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 week',
    'system',
    'fee',
    FALSE
);

-- Create transaction history for Multi-Asset Vault
-- Initial deposit from user-001: $25,000 (40% BTC, 40% ETH, 20% USDT)
INSERT INTO vault_transactions (
    id, vault_id, user_id, type, status,
    amount_usd, shares, price_per_share,
    asset, account, asset_quantity, asset_price,
    fee_amount, fee_type, fee_rate,
    vault_aum_before, vault_aum_after,
    share_price_before, share_price_after,
    user_shares_before, user_shares_after,
    timestamp, created_by, transaction_type, is_reversal
) VALUES
(
    'vault-tx-021',
    'vault-004',
    'user-001',
    'deposit',
    'executed',
    25000, 25000, 1.0,
    'BTC', 'Binance Spot', 0.22, 45000,
    0, NULL, 0,
    0, 25000,
    1.0, 1.0,
    0, 25000,
    NOW() - INTERVAL '6 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-022',
    'vault-004',
    'user-001',
    'mint_shares',
    'executed',
    25000, 25000, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    0, 25000,
    1.0, 1.0,
    0, 25000,
    NOW() - INTERVAL '6 months',
    'system',
    'mint_shares',
    FALSE
),
-- Deposit from user-002: $20,000
(
    'vault-tx-023',
    'vault-004',
    'user-002',
    'deposit',
    'executed',
    20000, 20000, 1.0,
    'ETH', 'Binance Spot', 8, 2500,
    0, NULL, 0,
    25000, 45000,
    1.0, 1.0,
    0, 20000,
    NOW() - INTERVAL '5 months',
    'system',
    'deposit',
    FALSE
),
(
    'vault-tx-024',
    'vault-004',
    'user-002',
    'mint_shares',
    'executed',
    20000, 20000, 1.0,
    NULL, NULL, 0, 0,
    0, NULL, 0,
    25000, 45000,
    1.0, 1.0,
    0, 20000,
    NOW() - INTERVAL '5 months',
    'system',
    'mint_shares',
    FALSE
),
-- Valuation update: portfolio value increased
(
    'vault-tx-025',
    'vault-004',
    NULL,
    'valuation',
    'executed',
    0, 0, 1.0,
    'BTC', 'Binance Spot', 0.22, 65000,
    0, NULL, 0,
    45000, 59300,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '2 months',
    'system',
    'valuation',
    FALSE
),
-- Yield income: $1,200 from portfolio
(
    'vault-tx-026',
    'vault-004',
    NULL,
    'yield',
    'executed',
    1200, 0, 1.0,
    'USDT', 'Kyberswap', 1200, 1,
    0, NULL, 0,
    59300, 60500,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 month',
    'system',
    'yield',
    FALSE
),
-- Management fee: 0.75% of AUM = $453.75
(
    'vault-tx-027',
    'vault-004',
    NULL,
    'fee',
    'executed',
    453.75, 0, 1.0,
    NULL, NULL, 0, 0,
    453.75, 'management', 0.0075,
    60500, 60046.25,
    1.0, 1.0,
    0, 0,
    NOW() - INTERVAL '1 week',
    'system',
    'fee',
    FALSE
);

-- ============================================================================
-- PHASE 8: Recalculate All Vault States from Transactions
-- ============================================================================

-- Recalculate vault states
SELECT recalculate_vault_from_transactions('vault-001');
SELECT recalculate_vault_from_transactions('vault-002');
SELECT recalculate_vault_from_transactions('vault-003');
SELECT recalculate_vault_from_transactions('vault-004');

-- Recalculate user holdings
SELECT recalculate_user_vault_holdings('vault-001', 'user-001');
SELECT recalculate_user_vault_holdings('vault-001', 'user-002');
SELECT recalculate_user_vault_holdings('vault-002', 'user-001');
SELECT recalculate_user_vault_holdings('vault-002', 'user-003');
SELECT recalculate_user_vault_holdings('vault-003', 'user-001');
SELECT recalculate_user_vault_holdings('vault-003', 'user-004');
SELECT recalculate_user_vault_holdings('vault-004', 'user-001');
SELECT recalculate_user_vault_holdings('vault-004', 'user-002');

-- Recalculate asset holdings
SELECT recalculate_vault_asset_holdings('vault-001', 'BTC', 'Binance Spot');
SELECT recalculate_vault_asset_holdings('vault-002', 'ETH', 'Binance Spot');
SELECT recalculate_vault_asset_holdings('vault-003', 'USDT', 'Kyberswap');
SELECT recalculate_vault_asset_holdings('vault-004', 'BTC', 'Binance Spot');
SELECT recalculate_vault_asset_holdings('vault-004', 'ETH', 'Binance Spot');
SELECT recalculate_vault_asset_holdings('vault-004', 'USDT', 'Kyberswap');

COMMIT;





