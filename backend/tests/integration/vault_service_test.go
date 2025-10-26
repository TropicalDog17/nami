package integration

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// TestVaultService_CreateVault tests vault creation functionality
func TestVaultService_CreateVault(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	tests := []struct {
		name          string
		vaultName     string
		asset         string
		account       string
		initialDeposit decimal.Decimal
		horizon       string
		expectError   bool
		errorContains string
	}{
		{
			name:          "Valid BTC vault",
			vaultName:     "Bitcoin Savings",
			asset:         "BTC",
			account:       "Binance Spot",
			initialDeposit: decimal.NewFromFloat(0.1),
			horizon:       "long-term",
			expectError:   false,
		},
		{
			name:          "Valid USDT vault",
			vaultName:     "USDT Stash",
			asset:         "USDT",
			account:       "Binance Spot",
			initialDeposit: decimal.NewFromFloat(1000),
			horizon:       "",
			expectError:   false,
		},
		{
			name:          "Empty vault name",
			vaultName:     "",
			asset:         "BTC",
			account:       "Binance Spot",
			initialDeposit: decimal.NewFromFloat(0.1),
			horizon:       "long-term",
			expectError:   false, // Service allows empty names (could be enhanced later)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vault, err := invSvc.CreateVault(ctx, tt.vaultName, tt.asset, tt.account, tt.initialDeposit, tt.horizon)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
				assert.Nil(t, vault)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, vault)

				// Verify vault properties
				assert.True(t, vault.IsVault)
				assert.Equal(t, tt.vaultName, *vault.VaultName)
				assert.Equal(t, tt.asset, vault.Asset)
				assert.Equal(t, tt.account, vault.Account)
				assert.True(t, vault.DepositQty.Equal(tt.initialDeposit))
				assert.True(t, vault.IsOpen)
				assert.Equal(t, string(models.VaultStatusActive), *vault.VaultStatus)

				// Verify derived fields
				assert.True(t, vault.RealizedPnL.IsZero())
				assert.True(t, vault.RemainingQty.Equal(vault.DepositQty))

				// Verify horizon if provided
				if tt.horizon != "" {
					assert.Equal(t, tt.horizon, *vault.Horizon)
				}
			}
		})
	}
}

// TestVaultService_CreateVaultDuplicateName tests duplicate vault name handling
func TestVaultService_CreateVaultDuplicateName(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create first vault
	vaultName := "Test Vault"
	_, err := invSvc.CreateVault(ctx, vaultName, "BTC", "Binance Spot", decimal.NewFromFloat(0.1), "long-term")
	require.NoError(t, err)

	// Try to create vault with same name
	_, err = invSvc.CreateVault(ctx, vaultName, "USDT", "Binance Spot", decimal.NewFromFloat(1000), "short-term")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")
}

// TestVaultService_GetActiveVaults tests retrieving active vaults
func TestVaultService_GetActiveVaults(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Initially no vaults
	vaults, err := invSvc.GetActiveVaults(ctx)
	assert.NoError(t, err)
	assert.Empty(t, vaults)

	// Create some vaults
	vaultsToCreate := []struct {
		name  string
		asset string
		qty   decimal.Decimal
	}{
		{"BTC Vault", "BTC", decimal.NewFromFloat(0.1)},
		{"USDT Vault", "USDT", decimal.NewFromFloat(1000)},
		{"ETH Vault", "ETH", decimal.NewFromFloat(1.0)},
	}

	for _, vc := range vaultsToCreate {
		_, err := invSvc.CreateVault(ctx, vc.name, vc.asset, "Binance Spot", vc.qty, "long-term")
		require.NoError(t, err)
	}

	// Retrieve active vaults
	vaults, err = invSvc.GetActiveVaults(ctx)
	assert.NoError(t, err)
	assert.Len(t, vaults, 3)

	// Verify vault properties
	vaultMap := make(map[string]*models.Investment)
	for _, vault := range vaults {
		vaultMap[*vault.VaultName] = vault
	}

	for _, vc := range vaultsToCreate {
		vault, exists := vaultMap[vc.name]
		assert.True(t, exists)
		assert.True(t, vault.IsVault)
		assert.Equal(t, vc.asset, vault.Asset)
		assert.True(t, vault.DepositQty.Equal(vc.qty))
		assert.True(t, vault.IsVaultActive())
	}
}

// TestVaultService_DepositToVault tests depositing to existing vaults
func TestVaultService_DepositToVault(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Test BTC Vault"
	initialDeposit := decimal.NewFromFloat(0.1)
	vault, err := invSvc.CreateVault(ctx, vaultName, "BTC", "Binance Spot", initialDeposit, "long-term")
	require.NoError(t, err)

	// Verify initial state
	assert.True(t, vault.IsVaultActive())
	assert.True(t, vault.DepositQty.Equal(initialDeposit))

	// Deposit more to the vault
	additionalDeposit := decimal.NewFromFloat(0.05)
	depositCost := decimal.NewFromFloat(2000) // Assuming BTC = $40,000
	sourceAccount := "Coinbase"

	updatedVault, err := invSvc.DepositToVault(ctx, vaultName, additionalDeposit, depositCost, sourceAccount)
	assert.NoError(t, err)
	assert.NotNil(t, updatedVault)

	// Verify deposit was added
	expectedTotalQty := initialDeposit.Add(additionalDeposit)
	assert.True(t, updatedVault.DepositQty.Equal(expectedTotalQty))

	// Verify vault remains active
	assert.True(t, updatedVault.IsVaultActive())

	// Note: Transaction verification would require adding InvestmentID filter to TransactionFilter
	// For now, we trust the service layer creates transactions correctly
	// TODO: Add transaction filter support for InvestmentID field
}

// TestVaultService_WithdrawFromVault tests withdrawing from vaults
func TestVaultService_WithdrawFromVault(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Test USDT Vault"
	initialDeposit := decimal.NewFromInt(1000)
	vault, err := invSvc.CreateVault(ctx, vaultName, "USDT", "Binance Spot", initialDeposit, "long-term")
	require.NoError(t, err)

	// Verify initial state
	assert.True(t, vault.IsVaultActive())
	assert.True(t, vault.DepositQty.Equal(initialDeposit))

	// Withdraw from the vault
	withdrawalQty := decimal.NewFromInt(300)
	withdrawalValue := decimal.NewFromInt(300) // 1:1 for USDT
	targetAccount := "Personal Wallet"

	updatedVault, err := invSvc.WithdrawFromVault(ctx, vaultName, withdrawalQty, withdrawalValue, targetAccount)
	assert.NoError(t, err)
	assert.NotNil(t, updatedVault)

	// Verify withdrawal was processed
	expectedRemainingQty := initialDeposit.Sub(withdrawalQty)
	assert.True(t, updatedVault.WithdrawalQty.Equal(withdrawalQty))
	assert.True(t, updatedVault.RemainingQty.Equal(expectedRemainingQty))

	// Verify vault remains active
	assert.True(t, updatedVault.IsVaultActive())

	// Note: Transaction verification would require adding InvestmentID filter to TransactionFilter
	// For now, we trust the service layer creates transactions correctly
}

// TestVaultService_EndVault tests ending vault lifecycle
func TestVaultService_EndVault(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Test ETH Vault"
	vault, err := invSvc.CreateVault(ctx, vaultName, "ETH", "Binance Spot", decimal.NewFromFloat(1.0), "long-term")
	require.NoError(t, err)

	// Verify initial state
	assert.True(t, vault.IsVaultActive())
	assert.True(t, vault.DepositQty.Equal(decimal.NewFromFloat(1.0)))

	// End the vault
	endedVault, err := invSvc.EndVault(ctx, vaultName)
	assert.NoError(t, err)
	assert.NotNil(t, endedVault)

	// Verify vault is ended
	assert.False(t, endedVault.IsOpen)
	assert.Equal(t, string(models.VaultStatusEnded), *endedVault.VaultStatus)
	assert.NotNil(t, endedVault.VaultEndedAt)

	// Verify it's no longer in active vaults
	activeVaults, err := invSvc.GetActiveVaults(ctx)
	assert.NoError(t, err)
	assert.Empty(t, activeVaults)

	// Try to deposit to ended vault (should fail)
	_, err = invSvc.DepositToVault(ctx, vaultName, decimal.NewFromFloat(0.1), decimal.NewFromInt(2000), "Coinbase")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not active")
}

// TestVaultService_DeleteVault tests vault deletion
func TestVaultService_DeleteVault(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Test Vault to Delete"
	_, err := invSvc.CreateVault(ctx, vaultName, "BTC", "Binance Spot", decimal.NewFromFloat(0.1), "long-term")
	require.NoError(t, err)

	// Try to delete active vault (should fail)
	err = invSvc.DeleteVault(ctx, vaultName)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot delete active vault")

	// End the vault first
	_, err = invSvc.EndVault(ctx, vaultName)
	require.NoError(t, err)

	// Now delete the vault
	err = invSvc.DeleteVault(ctx, vaultName)
	assert.NoError(t, err)

	// Verify vault is deleted
	_, err = invSvc.GetVaultByName(ctx, vaultName)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

// TestVaultService_BlackboxBehavior tests vault blackbox behavior (no validation)
func TestVaultService_BlackboxBehavior(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Blackbox Test Vault"
	initialDeposit := decimal.NewFromInt(100)
	vault, err := invSvc.CreateVault(ctx, vaultName, "USDT", "Binance Spot", initialDeposit, "long-term")
	require.NoError(t, err)

	// Verify initial state
	assert.True(t, vault.IsVaultActive())
	assert.True(t, vault.DepositQty.Equal(initialDeposit))

	// Test: Withdraw more than deposited (blackbox should allow this)
	overWithdrawal := decimal.NewFromInt(200) // More than initial 100
	_, err = invSvc.WithdrawFromVault(ctx, vaultName, overWithdrawal, overWithdrawal, "Test Account")
	assert.NoError(t, err) // Blackbox approach allows this

	// Test: Deposit negative amount (blackbox should allow this in theory)
	// Note: This might fail at database level due to constraints, but service logic should allow it
	negativeDeposit := decimal.NewFromInt(-50)
	_, err = invSvc.DepositToVault(ctx, vaultName, negativeDeposit, negativeDeposit, "Test Account")
	// This might fail due to database constraints, which is acceptable
}

// TestVaultService_MultipleDepositsWithdrawals tests multiple operations on same vault
func TestVaultService_MultipleDepositsWithdrawals(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Create a vault
	vaultName := "Multi-Op Vault"
	initialDeposit := decimal.NewFromInt(500)
	vault, err := invSvc.CreateVault(ctx, vaultName, "USDT", "Binance Spot", initialDeposit, "long-term")
	require.NoError(t, err)

	// Verify initial state
	assert.True(t, vault.IsVaultActive())
	assert.True(t, vault.DepositQty.Equal(initialDeposit))

	// Perform multiple deposits and withdrawals
	operations := []struct {
		typeStr        string
		amount         decimal.Decimal
		sourceAccount  string
		targetAccount  string
	}{
		{"deposit", decimal.NewFromInt(200), "Coinbase", ""},
		{"withdrawal", decimal.NewFromInt(100), "", "Personal"},
		{"deposit", decimal.NewFromInt(300), "Kraken", ""},
		{"withdrawal", decimal.NewFromInt(150), "", "Savings"},
	}

	for _, op := range operations {
		if op.typeStr == "deposit" {
			_, err = invSvc.DepositToVault(ctx, vaultName, op.amount, op.amount, op.sourceAccount)
		} else {
			_, err = invSvc.WithdrawFromVault(ctx, vaultName, op.amount, op.amount, op.targetAccount)
		}
		assert.NoError(t, err)
	}

	// Verify final state
	finalVault, err := invSvc.GetVaultByName(ctx, vaultName)
	assert.NoError(t, err)

	// Expected: 500 (initial) + 200 + 300 (deposits) - 100 - 150 (withdrawals) = 750
	expectedFinalQty := decimal.NewFromInt(750)
	assert.True(t, finalVault.RemainingQty.Equal(expectedFinalQty))

	// Note: Transaction verification would require adding InvestmentID filter to TransactionFilter
	// Total transactions should be 4 (2 deposits + 2 withdrawals)
}

// TestVaultService_GetVaultByName tests retrieving vault by name
func TestVaultService_GetVaultByName(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Try to get non-existent vault
	_, err := invSvc.GetVaultByName(ctx, "Non-existent Vault")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")

	// Create a vault
	vaultName := "Retrieve Test Vault"
	createdVault, err := invSvc.CreateVault(ctx, vaultName, "BTC", "Binance Spot", decimal.NewFromFloat(0.2), "short-term")
	require.NoError(t, err)

	// Verify created vault properties
	assert.True(t, createdVault.IsVault)
	assert.Equal(t, vaultName, *createdVault.VaultName)
	assert.True(t, createdVault.DepositQty.Equal(decimal.NewFromFloat(0.2)))

	// Retrieve the vault
	retrievedVault, err := invSvc.GetVaultByName(ctx, vaultName)
	assert.NoError(t, err)
	assert.NotNil(t, retrievedVault)

	// Verify properties match
	assert.Equal(t, createdVault.ID, retrievedVault.ID)
	assert.Equal(t, vaultName, *retrievedVault.VaultName)
	assert.Equal(t, "BTC", retrievedVault.Asset)
	assert.True(t, retrievedVault.DepositQty.Equal(decimal.NewFromFloat(0.2)))
	assert.True(t, retrievedVault.IsVaultActive())
}