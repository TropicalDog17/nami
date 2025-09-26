# Data Model: Transaction Tracking Schema

## Database Schema (PostgreSQL)

### Core Transaction Table

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
```

### Master Data Tables

```sql
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
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_asset ON transactions(asset);
CREATE INDEX idx_transactions_account ON transactions(account);
CREATE INDEX idx_transactions_tag ON transactions(tag);
CREATE INDEX idx_transactions_date_type ON transactions(date, type);

-- FX rate lookup
CREATE INDEX idx_fx_rates_lookup ON fx_rates(from_currency, to_currency, date);
```

### Initial Data

```sql
-- Seed initial transaction types
INSERT INTO transaction_types (name, description) VALUES
('buy', 'Purchase of an asset'),
('sell', 'Sale of an asset'),
('deposit', 'Deposit into account or LP'),
('withdraw', 'Withdrawal from account or LP'),
('transfer_in', 'Transfer into account'),
('transfer_out', 'Transfer out of account'),
('expense', 'Expense or spending'),
('income', 'Income or earnings'),
('reward', 'Rewards or cashback'),
('airdrop', 'Token airdrop'),
('fee', 'Transaction or service fee'),
('lend', 'Lending transaction'),
('repay', 'Loan repayment received'),
('interest', 'Interest income'),
('borrow', 'Borrowing transaction'),
('repay_borrow', 'Loan repayment made'),
('interest_expense', 'Interest expense paid');

-- Seed common accounts
INSERT INTO accounts (name, type) VALUES
('Cash', 'Cash'),
('Bank', 'Bank'),
('CreditCard', 'CreditCard'),
('Binance Spot', 'Exchange'),
('Vault', 'Investment'),
('Friend A Loan', 'Peer');

-- Seed common assets
INSERT INTO assets (symbol, name, decimals) VALUES
('VND', 'Vietnamese Dong', 0),
('USD', 'US Dollar', 2),
('USDT', 'Tether USD', 6),
('BTC', 'Bitcoin', 8),
('ETH', 'Ethereum', 18);

-- Seed common tags
INSERT INTO tags (name, category) VALUES
('Food', 'Expense'),
('Housing', 'Expense'),
('Transport', 'Expense'),
('LP', 'Investment'),
('Staking', 'Investment'),
('Salary', 'Income'),
('Trading', 'Investment');
```

## Go Data Structures

```go
// Core transaction struct
type Transaction struct {
    ID           string          `json:"id" db:"id"`
    Date         time.Time       `json:"date" db:"date"`
    Type         string          `json:"type" db:"type"`
    Asset        string          `json:"asset" db:"asset"`
    Account      string          `json:"account" db:"account"`
    Counterparty *string         `json:"counterparty" db:"counterparty"`
    Tag          *string         `json:"tag" db:"tag"`
    Note         *string         `json:"note" db:"note"`

    // Amount fields
    Quantity    decimal.Decimal `json:"quantity" db:"quantity"`
    PriceLocal  decimal.Decimal `json:"price_local" db:"price_local"`
    AmountLocal decimal.Decimal `json:"amount_local" db:"amount_local"`

    // FX and dual currency
    FXToUSD   decimal.Decimal `json:"fx_to_usd" db:"fx_to_usd"`
    FXToVND   decimal.Decimal `json:"fx_to_vnd" db:"fx_to_vnd"`
    AmountUSD decimal.Decimal `json:"amount_usd" db:"amount_usd"`
    AmountVND decimal.Decimal `json:"amount_vnd" db:"amount_vnd"`

    // Fees
    FeeUSD decimal.Decimal `json:"fee_usd" db:"fee_usd"`
    FeeVND decimal.Decimal `json:"fee_vnd" db:"fee_vnd"`

    // Derived metrics
    DeltaQty    decimal.Decimal `json:"delta_qty" db:"delta_qty"`
    CashFlowUSD decimal.Decimal `json:"cashflow_usd" db:"cashflow_usd"`
    CashFlowVND decimal.Decimal `json:"cashflow_vnd" db:"cashflow_vnd"`

    // Optional tracking
    Horizon   *string    `json:"horizon" db:"horizon"`
    EntryDate *time.Time `json:"entry_date" db:"entry_date"`
    ExitDate  *time.Time `json:"exit_date" db:"exit_date"`
    FXImpact  *decimal.Decimal `json:"fx_impact" db:"fx_impact"`

    // Audit fields
    FXSource    *string    `json:"fx_source" db:"fx_source"`
    FXTimestamp *time.Time `json:"fx_timestamp" db:"fx_timestamp"`
    CreatedAt   time.Time  `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

// Master data structures
type TransactionType struct {
    ID          int       `json:"id" db:"id"`
    Name        string    `json:"name" db:"name"`
    Description *string   `json:"description" db:"description"`
    IsActive    bool      `json:"is_active" db:"is_active"`
    CreatedAt   time.Time `json:"created_at" db:"created_at"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type Account struct {
    ID        int       `json:"id" db:"id"`
    Name      string    `json:"name" db:"name"`
    Type      *string   `json:"type" db:"type"`
    IsActive  bool      `json:"is_active" db:"is_active"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Asset struct {
    ID        int       `json:"id" db:"id"`
    Symbol    string    `json:"symbol" db:"symbol"`
    Name      *string   `json:"name" db:"name"`
    Decimals  int       `json:"decimals" db:"decimals"`
    IsActive  bool      `json:"is_active" db:"is_active"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Tag struct {
    ID        int       `json:"id" db:"id"`
    Name      string    `json:"name" db:"name"`
    Category  *string   `json:"category" db:"category"`
    IsActive  bool      `json:"is_active" db:"is_active"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type FXRate struct {
    ID           int             `json:"id" db:"id"`
    FromCurrency string          `json:"from_currency" db:"from_currency"`
    ToCurrency   string          `json:"to_currency" db:"to_currency"`
    Rate         decimal.Decimal `json:"rate" db:"rate"`
    Date         time.Time       `json:"date" db:"date"`
    Source       string          `json:"source" db:"source"`
    CreatedAt    time.Time       `json:"created_at" db:"created_at"`
}
```

## Business Rules

### Derived Field Calculations

```go
// Calculate derived fields before saving
func (t *Transaction) CalculateDerivedFields() {
    // Calculate AmountLocal
    t.AmountLocal = t.Quantity.Mul(t.PriceLocal)

    // Calculate USD/VND amounts
    t.AmountUSD = t.AmountLocal.Mul(t.FXToUSD)
    t.AmountVND = t.AmountLocal.Mul(t.FXToVND)

    // Calculate ΔQty based on transaction type
    switch t.Type {
    case "buy", "deposit", "transfer_in", "income", "reward", "airdrop", "lend", "repay", "interest":
        t.DeltaQty = t.Quantity
    case "sell", "withdraw", "transfer_out", "expense", "fee", "repay_borrow", "interest_expense":
        t.DeltaQty = t.Quantity.Neg()
    case "borrow":
        // Borrow increases liability (negative for cash, positive for debt)
        if t.Account == "CreditCard" {
            t.DeltaQty = t.Quantity
        } else {
            t.DeltaQty = t.Quantity.Neg()
        }
    }

    // Calculate CashFlow based on transaction type and account
    if t.Account == "CreditCard" && t.Type == "expense" {
        // Credit card expense: no immediate cash flow
        t.CashFlowUSD = decimal.Zero
        t.CashFlowVND = decimal.Zero
    } else {
        switch t.Type {
        case "buy", "expense", "fee", "transfer_out", "lend", "repay_borrow", "interest_expense":
            t.CashFlowUSD = t.AmountUSD.Add(t.FeeUSD).Neg()
            t.CashFlowVND = t.AmountVND.Add(t.FeeVND).Neg()
        case "sell", "income", "reward", "airdrop", "transfer_in", "repay", "interest":
            t.CashFlowUSD = t.AmountUSD.Sub(t.FeeUSD)
            t.CashFlowVND = t.AmountVND.Sub(t.FeeVND)
        case "deposit", "withdraw", "borrow":
            // No net cash flow for deposits/withdrawals within same currency
            t.CashFlowUSD = decimal.Zero
            t.CashFlowVND = decimal.Zero
        }
    }
}
```

### Validation Rules

```go
func (t *Transaction) Validate() error {
    if t.Date.IsZero() {
        return errors.New("date is required")
    }
    if t.Type == "" {
        return errors.New("type is required")
    }
    if t.Asset == "" {
        return errors.New("asset is required")
    }
    if t.Account == "" {
        return errors.New("account is required")
    }
    if t.Quantity.IsZero() {
        return errors.New("quantity must be non-zero")
    }
    if t.PriceLocal.IsNegative() {
        return errors.New("price must be non-negative")
    }
    if t.FXToUSD.IsZero() {
        return errors.New("FX to USD rate is required")
    }
    if t.FXToVND.IsZero() {
        return errors.New("FX to VND rate is required")
    }
    return nil
}
```

This data model provides the foundation for the transaction tracking system with proper normalization, indexing, and business rule enforcement.
