# Transaction-Based Vault System

## Overview

The Nami vault system has been refactored to be **fully transaction-based**. This means:

1. **All vault state is derived from transactions** - There is a single source of truth: the `vault_transactions` table
2. **Immutable transaction ledger** - Transactions are append-only; corrections are done via reversals
3. **Calculated holdings** - Vault holdings, balances, and AUM are calculated from transaction history
4. **Audit trail** - Complete transaction history provides full auditability

## Architecture

### Core Concept

```
vault_transactions (immutable ledger)
    ↓
    ├─→ recalculate_vault_from_transactions()
    ├─→ recalculate_user_vault_holdings()
    └─→ recalculate_vault_asset_holdings()
    ↓
vault (derived state)
vault_shares (derived state)
vault_assets (derived state)
```

### Transaction Types

All vault operations are recorded as transactions:

| Type | Description | Effect |
|------|-------------|--------|
| `deposit` | User deposits funds into vault | Increases AUM, creates liability |
| `withdrawal` | User withdraws funds from vault | Decreases AUM, reduces liability |
| `mint_shares` | Shares issued to user | Increases total supply |
| `burn_shares` | Shares redeemed from user | Decreases total supply |
| `yield` | Income generated (interest, farming, etc.) | Increases AUM |
| `income` | Other income sources | Increases AUM |
| `fee` | Management or performance fees | Decreases AUM |
| `expense` | Operating expenses | Decreases AUM |
| `rebalance` | Asset rebalancing | Updates asset allocation |
| `valuation` | Mark-to-market valuation | Updates asset prices |

### State Derivation

#### Vault Holdings (from `vault_holdings_view`)

```sql
total_shares = SUM(shares for deposit/mint_shares/yield/income) 
             - SUM(shares for withdrawal/burn_shares/fee/expense)

total_aum = SUM(amount_usd for deposit/mint_shares/yield/income)
          - SUM(amount_usd for withdrawal/burn_shares/fee/expense)

share_price = total_aum / total_shares (or 1.0 if total_shares = 0)
```

#### User Holdings (from `user_vault_holdings_view`)

```sql
share_balance = SUM(shares for deposit/mint_shares/yield/income)
              - SUM(shares for withdrawal/burn_shares/fee/expense)

net_deposits = SUM(amount_usd for deposit/mint_shares)
             - SUM(amount_usd for withdrawal/burn_shares)

total_fees_paid = SUM(fee_amount for fee transactions)
```

#### Asset Holdings (from `vault_asset_holdings_view`)

```sql
total_quantity = SUM(asset_quantity for deposit/income/yield)
               - SUM(asset_quantity for withdrawal/expense/fee)

total_value = SUM(asset_quantity * asset_price for deposit/income/yield)
            - SUM(asset_quantity * asset_price for withdrawal/expense/fee)
```

## Database Schema

### Key Tables

#### `vault_transactions` (Immutable Ledger)

```sql
CREATE TABLE vault_transactions (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    type VARCHAR(20) NOT NULL,  -- deposit, withdrawal, mint_shares, etc.
    status VARCHAR(20) NOT NULL,
    amount_usd DECIMAL(30,18),
    shares DECIMAL(30,18),
    price_per_share DECIMAL(30,18),
    asset VARCHAR(50),
    account VARCHAR(100),
    asset_quantity DECIMAL(30,18),
    asset_price DECIMAL(30,18),
    fee_amount DECIMAL(30,18),
    fee_type VARCHAR(20),
    fee_rate DECIMAL(8,8),
    vault_aum_before DECIMAL(30,18),
    vault_aum_after DECIMAL(30,18),
    share_price_before DECIMAL(30,18),
    share_price_after DECIMAL(30,18),
    user_shares_before DECIMAL(30,18),
    user_shares_after DECIMAL(30,18),
    timestamp TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ,
    transaction_hash VARCHAR(255),
    external_tx_id VARCHAR(255),
    notes TEXT,
    is_reversal BOOLEAN DEFAULT FALSE,
    reversal_of_id VARCHAR(255),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

#### `vaults` (Derived State)

```sql
CREATE TABLE vaults (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    token_decimals INTEGER NOT NULL,
    total_supply DECIMAL(30,18),           -- Derived from transactions
    total_assets_under_management DECIMAL(30,18),  -- Derived
    current_share_price DECIMAL(30,18),    -- Derived
    initial_share_price DECIMAL(30,18),
    high_watermark DECIMAL(30,18),
    is_user_defined_price BOOLEAN,
    manual_price_per_share DECIMAL(30,18),
    last_transaction_id VARCHAR(255),      -- Reference to last transaction
    transaction_count INTEGER,             -- Count of transactions
    is_derived BOOLEAN DEFAULT TRUE,       -- Flag indicating state is derived
    ...
);
```

#### `vault_shares` (Derived State)

```sql
CREATE TABLE vault_shares (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    share_balance DECIMAL(30,18),          -- Derived from transactions
    cost_basis DECIMAL(30,18),
    avg_cost_per_share DECIMAL(30,18),
    total_deposits DECIMAL(30,18),         -- Derived
    total_withdrawals DECIMAL(30,18),      -- Derived
    net_deposits DECIMAL(30,18),           -- Derived
    current_market_value DECIMAL(30,18),
    unrealized_pnl DECIMAL(30,18),
    unrealized_pnl_percent DECIMAL(30,18),
    realized_pnl DECIMAL(30,18),
    realized_pnl_percent DECIMAL(30,18),
    fees_paid DECIMAL(30,18),              -- Derived
    last_transaction_id VARCHAR(255),      -- Reference to last transaction
    transaction_count INTEGER,             -- Count of transactions
    is_derived BOOLEAN DEFAULT TRUE,
    ...
);
```

#### `vault_assets` (Derived State)

```sql
CREATE TABLE vault_assets (
    id VARCHAR(255) PRIMARY KEY,
    vault_id VARCHAR(255) NOT NULL,
    asset VARCHAR(50) NOT NULL,
    account VARCHAR(100) NOT NULL,
    quantity DECIMAL(30,18),               -- Derived from transactions
    avg_cost_basis DECIMAL(30,18),
    current_price DECIMAL(30,18),
    current_market_value DECIMAL(30,18),   -- Derived
    target_allocation DECIMAL(5,4),
    unrealized_pnl DECIMAL(30,18),
    realized_pnl DECIMAL(30,18),
    total_bought DECIMAL(30,18),
    total_sold DECIMAL(30,18),
    total_cost DECIMAL(30,18),
    total_proceeds DECIMAL(30,18),
    income_received DECIMAL(30,18),
    last_transaction_id VARCHAR(255),      -- Reference to last transaction
    transaction_count INTEGER,             -- Count of transactions
    is_derived BOOLEAN DEFAULT TRUE,
    ...
);
```

### Views

Three views provide convenient access to derived state:

#### `vault_holdings_view`
Aggregates vault-level holdings from transactions:
- `total_shares_outstanding`
- `total_aum`
- `transaction_count`
- `last_transaction_at`

#### `user_vault_holdings_view`
Aggregates user-specific holdings from transactions:
- `share_balance`
- `net_deposits`
- `total_fees_paid`
- `transaction_count`
- `last_activity_date`

#### `vault_asset_holdings_view`
Aggregates asset-specific holdings from transactions:
- `total_quantity`
- `total_value`
- `transaction_count`
- `last_transaction_at`

### Stored Procedures

#### `recalculate_vault_from_transactions(vault_id)`

Recalculates vault state from all transactions:
- Updates `total_supply`, `total_assets_under_management`, `current_share_price`
- Updates `last_transaction_id`, `transaction_count`
- Sets `is_derived = TRUE`

#### `recalculate_user_vault_holdings(vault_id, user_id)`

Recalculates user holdings from transactions:
- Updates `share_balance`, `net_deposits`, `fees_paid`
- Updates `last_transaction_id`, `transaction_count`
- Sets `is_derived = TRUE`

#### `recalculate_vault_asset_holdings(vault_id, asset, account)`

Recalculates asset holdings from transactions:
- Updates `quantity`, `current_market_value`
- Updates `last_transaction_id`, `transaction_count`
- Sets `is_derived = TRUE`

### Triggers

#### `trigger_vault_transaction_recalculate`

Automatically triggers after INSERT/UPDATE on `vault_transactions`:
1. Calls `recalculate_vault_from_transactions()`
2. Calls `recalculate_user_vault_holdings()` if `user_id` is provided
3. Calls `recalculate_vault_asset_holdings()` if `asset` and `account` are provided

This ensures derived state is always up-to-date.

## API Usage

### Creating Vault Transactions

```go
// Create a deposit transaction
tx := &models.VaultTransaction{
    VaultID: "vault-001",
    UserID: "user-001",
    Type: models.VaultTxTypeDeposit,
    Status: "executed",
    AmountUSD: decimal.NewFromInt(10000),
    Shares: decimal.NewFromInt(10000),
    PricePerShare: decimal.NewFromInt(1),
    Asset: "BTC",
    Account: "Binance Spot",
    AssetQuantity: decimal.NewFromFloat(0.25),
    AssetPrice: decimal.NewFromInt(40000),
    Timestamp: time.Now(),
    CreatedBy: "system",
}

// Create via repository
err := vaultTxRepo.Create(ctx, tx)

// Vault state is automatically recalculated via trigger
```

### Querying Holdings

```go
// Get vault holdings (derived from transactions)
holdings, err := vaultTxRepo.GetVaultHoldings(ctx, "vault-001")
// holdings.TotalShares, holdings.TotalAUM, holdings.SharePrice

// Get user holdings (derived from transactions)
userHoldings, err := vaultTxRepo.GetUserVaultHoldings(ctx, "vault-001", "user-001")
// userHoldings.ShareBalance, userHoldings.NetDeposits, userHoldings.TotalFeesPaid

// Get asset holdings (derived from transactions)
assetHoldings, err := vaultTxRepo.GetVaultAssetHoldings(ctx, "vault-001", "BTC", "Binance Spot")
// assetHoldings.TotalQuantity, assetHoldings.TotalValue
```

### Transaction History

```go
// Get all transactions for a vault
filter := &models.VaultTransactionFilter{
    VaultID: &vaultID,
    Limit: 100,
    Offset: 0,
}
txs, err := vaultTxRepo.List(ctx, filter)

// Get user's transaction history
userTxs, err := vaultTxRepo.GetUserTransactionHistory(ctx, "vault-001", "user-001", 50, 0)
```

## Reversals and Corrections

To correct a transaction, create a reversal transaction:

```go
// Original transaction
originalTx := &models.VaultTransaction{
    ID: "vault-tx-001",
    VaultID: "vault-001",
    Type: models.VaultTxTypeDeposit,
    AmountUSD: decimal.NewFromInt(10000),
    // ...
}

// Reversal transaction
reversalTx := &models.VaultTransaction{
    ID: "vault-tx-001-reversal",
    VaultID: "vault-001",
    Type: models.VaultTxTypeDeposit,
    AmountUSD: decimal.NewFromInt(-10000),  // Negative to reverse
    IsReversal: true,
    ReversalOfID: "vault-tx-001",
    // ...
}

// Create reversal
err := vaultTxRepo.Create(ctx, reversalTx)
// Vault state is automatically recalculated
```

## Seed Data

The system includes comprehensive seed data with 4 sample vaults:

1. **Bitcoin Holding Vault** (`vault-001`)
   - 2 users with deposits
   - Price appreciation from $45k to $65k
   - Yield income and management fees

2. **Ethereum Holding Vault** (`vault-002`)
   - 2 users with deposits
   - Price appreciation from $2.5k to $3.5k
   - Yield income and management fees

3. **Stablecoin Yield Vault** (`vault-003`)
   - 2 users with deposits
   - Yield farming income
   - Management fees

4. **Multi-Asset Portfolio** (`vault-004`)
   - 2 users with deposits
   - Diversified holdings (BTC, ETH, USDT)
   - Yield income and management fees

All seed data is created via transactions, demonstrating the transaction-based approach.

## Migration Steps

To apply the transaction-based system:

1. **Run migration 022** (`022_transaction_based_vault_system.sql`)
   - Adds transaction-based tracking columns
   - Creates views for derived state
   - Creates stored procedures for recalculation
   - Creates triggers for automatic updates

2. **Run migration 023** (`023_seed_transaction_based_vaults.sql`)
   - Creates sample vaults
   - Creates sample vault assets
   - Creates sample vault shares
   - Populates transaction history
   - Recalculates all derived state

3. **Update application code**
   - Use `VaultTransactionRepository` for all vault operations
   - Query holdings via `GetVaultHoldings()`, `GetUserVaultHoldings()`, etc.
   - Create transactions for all vault operations

## Benefits

1. **Auditability** - Complete transaction history for compliance
2. **Correctability** - Reversals allow corrections without data loss
3. **Consistency** - Single source of truth eliminates sync issues
4. **Performance** - Derived state is cached and updated via triggers
5. **Flexibility** - Easy to add new transaction types
6. **Reporting** - Transaction history enables detailed analysis

## Implementation Notes

### Automatic Recalculation

The `trigger_vault_transaction_recalculate` trigger ensures that:
- Every transaction insert/update automatically recalculates affected vault state
- No manual recalculation is needed
- Derived state is always consistent with transaction history

### Reversals

Reversals are handled via:
- `is_reversal` flag to mark as reversal
- `reversal_of_id` to reference original transaction
- Negative amounts to reverse the effect
- Trigger automatically excludes reversals from calculations (only counts non-reversal transactions)

### Performance Considerations

- Views provide O(1) access to derived state
- Indexes on `vault_id`, `user_id`, `asset`, `account` optimize queries
- Triggers ensure state is always up-to-date
- Consider archiving old transactions for very large vaults

## Future Enhancements

1. **Batch Operations** - Create multiple transactions atomically
2. **Transaction Linking** - Link related transactions (e.g., deposit + mint_shares)
3. **Performance Fees** - Automatic calculation based on high watermark
4. **Rebalancing** - Automatic asset rebalancing transactions
5. **Reporting** - Enhanced reporting from transaction history
6. **Analytics** - Transaction-level analytics and insights







