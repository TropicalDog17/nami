# Backend Integration Tests

This directory contains comprehensive integration tests for the Nami backend vault system.

## Overview

The integration tests verify:

1. **Vault Operations**: Creation, retrieval, updating, and deletion of vaults
2. **Vault Shares**: User share management and tracking
3. **Vault Assets**: Asset tracking and management
4. **Vault Transactions**: Transaction creation and retrieval with immutability guarantees
5. **Composite Operations**: Deposits, withdrawals, yield, and fee processing
6. **Data Consistency**: Ledger correctness and state recalculation
7. **Error Handling**: Proper error responses and validation

## Test Structure

### VaultServicesConsolidated Tests

The main test file `vault_services_test.go` tests the consolidated vault services interface, which provides:

- **Single Entry Point**: All vault operations through one interface
- **Dependency Injection**: Easy mocking for unit tests
- **Transaction Management**: Atomic operations with consistency guarantees
- **Clear Separation of Concerns**: Distinct methods for different operations

### Key Test Cases

#### Basic CRUD Operations

- `TestCreateVault`: Verifies vault creation with proper initialization
- `TestGetVault`: Verifies vault retrieval by ID
- `TestListVaults`: Verifies listing vaults with optional filters
- `TestUpdateVault`: Verifies vault updates

#### Vault Shares

- `TestVaultShareCreation`: Tests share creation and retrieval
- `TestGetVaultShares`: Tests retrieving all shares for a vault
- `TestGetUserVaultShares`: Tests retrieving shares for a specific user

#### Vault Assets

- `TestVaultAssetCreation`: Tests asset creation and retrieval
- `TestGetVaultAssets`: Tests retrieving all assets for a vault

#### Transactions

- `TestProcessDeposit`: Tests deposit processing with automatic share minting
- `TestProcessWithdrawal`: Tests withdrawal processing with share burning
- `TestProcessYield`: Tests yield income recording
- `TestProcessFee`: Tests fee deduction
- `TestGetVaultTransactions`: Tests transaction retrieval
- `TestGetUserTransactions`: Tests user-specific transaction retrieval

#### Consistency and Correctness

- `TestDepositWithdrawalConsistency`: Verifies deposits and withdrawals maintain consistency
- `TestTransactionImmutability`: Verifies transactions cannot be modified after creation

## Running Tests

### Prerequisites

1. PostgreSQL database running
2. Database migrations applied (including migration 025_consolidated_transaction_vault_system.sql)
3. Go 1.19+ installed

### Run All Tests

```bash
cd backend
go test ./tests/integration -v
```

### Run Specific Test

```bash
go test ./tests/integration -v -run TestCreateVault
```

### Run with Coverage

```bash
go test ./tests/integration -v -cover
```

### Run with Race Detection

```bash
go test ./tests/integration -v -race
```

## Test Database Setup

Tests use a test database that should be configured via environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=nami_test
```

Or create a `.env.test` file with these values.

## Key Testing Patterns

### 1. Vault Creation Pattern

```go
vault := &models.Vault{
    Name: "Test Vault",
    Type: "single_asset",
    Status: "active",
    // ... other fields
}

created, err := svc.CreateVault(ctx, vault)
require.NoError(t, err)
assert.NotEmpty(t, created.ID)
```

### 2. Transaction Processing Pattern

```go
depositTx, share, err := svc.ProcessDeposit(
    ctx,
    vaultID,
    userID,
    amountUSD,
    asset,
    quantity,
    price,
)
require.NoError(t, err)
assert.Equal(t, "deposit", depositTx.Type)
```

### 3. State Verification Pattern

```go
transactions, err := svc.GetVaultTransactions(ctx, vaultID)
require.NoError(t, err)
assert.GreaterOrEqual(t, len(transactions), expectedCount)
```

## Data Consistency Guarantees

The tests verify the following consistency guarantees:

### Transaction Immutability

- Transactions cannot be updated after creation
- Transactions cannot be deleted (only reversed)
- Database triggers enforce immutability

### Ledger Correctness

- All vault state is derived from transactions
- Automatic recalculation after each transaction
- Advisory locking prevents race conditions

### Share Tracking

- Shares are automatically minted on deposits
- Shares are automatically burned on withdrawals
- User holdings are correctly calculated

### Asset Tracking

- Asset quantities are tracked from transactions
- Asset values are calculated from prices
- Holdings are automatically recalculated

## Debugging Tests

### Enable Verbose Output

```bash
go test ./tests/integration -v
```

### Print SQL Queries

Set `GORM_LOG_LEVEL=debug` environment variable:

```bash
GORM_LOG_LEVEL=debug go test ./tests/integration -v
```

### Run Single Test with Debugging

```bash
go test ./tests/integration -v -run TestProcessDeposit -timeout 30s
```

## Common Issues

### Database Connection Errors

**Issue**: `failed to connect to database`

**Solution**: Verify PostgreSQL is running and environment variables are set correctly.

### Migration Errors

**Issue**: `migration not found` or `table does not exist`

**Solution**: Ensure all migrations have been applied, including migration 025.

### Test Timeout

**Issue**: Tests hang or timeout

**Solution**: Check for deadlocks in advisory locking or database queries. Run with `-timeout 60s` for longer operations.

## Performance Considerations

- Tests use transactions that are rolled back after each test
- Advisory locking is used to prevent race conditions
- Consider running tests with `-parallel 1` if experiencing lock contention

## Future Enhancements

1. **Stress Testing**: Add tests for high-volume transaction processing
2. **Concurrency Testing**: Add tests for concurrent operations
3. **Performance Benchmarks**: Add benchmarks for critical operations
4. **Chaos Testing**: Add tests for failure scenarios
5. **Integration with Real Data**: Add tests with production-like data volumes

## Related Documentation

- [Transaction-Based Vault System](../../docs/transaction_based_vault_system.md)
- [Ledger Correctness](../../migrations/024_ledger_correctness.sql)
- [Consolidated Migration](../../migrations/025_consolidated_transaction_vault_system.sql)





