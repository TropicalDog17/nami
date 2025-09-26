-- Initial schema for transaction tracking system
-- This migration creates all core tables for the transaction tracking system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dynamic transaction types (admin configurable)
CREATE TABLE transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail for transaction type changes
CREATE TABLE transaction_type_audit (
    id SERIAL PRIMARY KEY,
    type_id INTEGER REFERENCES transaction_types(id),
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT NOW()
);

-- Accounts
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50), -- 'Cash', 'Bank', 'CreditCard', 'Exchange', etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Assets
CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100),
    decimals INTEGER DEFAULT 8,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tags for categorization
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- FX rate cache
CREATE TABLE fx_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate DECIMAL(12,8) NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_currency, to_currency, date, source)
);

-- Transaction table (core entity)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL REFERENCES transaction_types(name),
    asset VARCHAR(10) NOT NULL,
    account VARCHAR(100) NOT NULL,
    counterparty VARCHAR(200),
    tag VARCHAR(100),
    note TEXT,
    
    -- Amount fields
    quantity DECIMAL(20,8) NOT NULL,
    price_local DECIMAL(20,8) NOT NULL,
    amount_local DECIMAL(20,8) NOT NULL,
    
    -- FX and dual currency
    fx_to_usd DECIMAL(12,8) NOT NULL,
    fx_to_vnd DECIMAL(12,2) NOT NULL,
    amount_usd DECIMAL(20,2) NOT NULL,
    amount_vnd DECIMAL(20,2) NOT NULL,
    
    -- Fees
    fee_usd DECIMAL(20,2) DEFAULT 0,
    fee_vnd DECIMAL(20,2) DEFAULT 0,
    
    -- Derived metrics (stored)
    delta_qty DECIMAL(20,8) NOT NULL,
    cashflow_usd DECIMAL(20,2) NOT NULL,
    cashflow_vnd DECIMAL(20,2) NOT NULL,
    
    -- Optional tracking
    horizon VARCHAR(20), -- 'short-term', 'long-term'
    entry_date DATE,
    exit_date DATE,
    fx_impact DECIMAL(20,2),
    
    -- Audit fields
    fx_source VARCHAR(50),
    fx_timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Update trigger for transactions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transaction_types_updated_at 
    BEFORE UPDATE ON transaction_types 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
