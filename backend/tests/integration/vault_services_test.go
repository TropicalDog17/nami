package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)



// TestCreateVault tests vault creation
func TestCreateVault(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })

	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	desc := "A test vault"
	vault := &models.Vault{
		Name:                "Test Vault",
		Description:         &desc,
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	created, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, vault.Name, created.Name)
	assert.Equal(t, vault.Type, created.Type)
}

// TestGetVault tests vault retrieval
func TestGetVault(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	created, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	retrieved, err := svc.GetVault(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, retrieved.ID)
	assert.Equal(t, created.Name, retrieved.Name)
}

// TestProcessDeposit tests deposit processing with transaction creation
func TestProcessDeposit(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	amountUSD := decimal.NewFromInt(10000)
	quantity := decimal.NewFromFloat(0.5)
	price := decimal.NewFromInt(20000)

	depositTx, share, err := svc.ProcessDeposit(
		ctx,
		createdVault.ID,
		"test-user-001",
		amountUSD,
		"BTC",
		quantity,
		price,
	)

	require.NoError(t, err)
	assert.NotNil(t, depositTx)
	assert.NotNil(t, share)
	assert.Equal(t, models.VaultTxTypeDeposit, depositTx.Type)
	assert.True(t, depositTx.AmountUSD.Equal(amountUSD))
	assert.True(t, depositTx.AssetQuantity.Equal(quantity))
	assert.True(t, depositTx.AssetPrice.Equal(price))
}

// TestProcessWithdrawal tests withdrawal processing
func TestProcessWithdrawal(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	_, _, err = svc.ProcessDeposit(
		ctx,
		createdVault.ID,
		"test-user-001",
		decimal.NewFromInt(10000),
		"BTC",
		decimal.NewFromFloat(0.5),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)

	withdrawAmount := decimal.NewFromInt(5000)
	withdrawalTx, share, err := svc.ProcessWithdrawal(
		ctx,
		createdVault.ID,
		"test-user-001",
		withdrawAmount,
		"BTC",
		decimal.NewFromFloat(0.25),
		decimal.NewFromInt(20000),
	)

	require.NoError(t, err)
	assert.NotNil(t, withdrawalTx)
	assert.NotNil(t, share)
	assert.Equal(t, models.VaultTxTypeWithdrawal, withdrawalTx.Type)
	assert.True(t, withdrawalTx.AmountUSD.Equal(withdrawAmount))
}

// TestProcessYield tests yield transaction creation
func TestProcessYield(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	yieldAmount := decimal.NewFromFloat(100.50)
	yieldTx, err := svc.ProcessYield(
		ctx,
		createdVault.ID,
		yieldAmount,
		"BTC",
		decimal.NewFromFloat(0.005),
		decimal.NewFromInt(20000),
	)

	require.NoError(t, err)
	assert.NotNil(t, yieldTx)
	assert.Equal(t, models.VaultTxTypeYield, yieldTx.Type)
	assert.True(t, yieldTx.AmountUSD.Equal(yieldAmount))
}

// TestProcessFee tests fee transaction creation
func TestProcessFee(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	feeAmount := decimal.NewFromFloat(50.25)
	ftype := "management"
	feeTx, err := svc.ProcessFee(
		ctx,
		createdVault.ID,
		feeAmount,
		ftype,
		decimal.NewFromFloat(0.005),
	)

	require.NoError(t, err)
	assert.NotNil(t, feeTx)
	assert.Equal(t, models.VaultTxTypeFee, feeTx.Type)
	assert.True(t, feeTx.FeeAmount.Equal(feeAmount))
	assert.Equal(t, &ftype, feeTx.FeeType)
}

// TestGetVaultTransactions tests transaction retrieval
func TestGetVaultTransactions(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	_, _, err = svc.ProcessDeposit(
		ctx,
		createdVault.ID,
		"test-user-001",
		decimal.NewFromInt(10000),
		"BTC",
		decimal.NewFromFloat(0.5),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)

	_, err = svc.ProcessYield(
		ctx,
		createdVault.ID,
		decimal.NewFromInt(100),
		"BTC",
		decimal.NewFromFloat(0.005),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)

	transactions, err := svc.GetVaultTransactions(ctx, createdVault.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(transactions), 2)
}

// TestGetUserTransactions tests user-specific transaction retrieval
func TestGetUserTransactions(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	userID := "test-user-001"

	_, _, err = svc.ProcessDeposit(
		ctx,
		createdVault.ID,
		userID,
		decimal.NewFromInt(10000),
		"BTC",
		decimal.NewFromFloat(0.5),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)

	transactions, err := svc.GetUserTransactions(ctx, userID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(transactions), 2) // deposit + mint_shares
}

// TestVaultShareCreation tests vault share creation and retrieval
func TestVaultShareCreation(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	share := &models.VaultShare{
		VaultID:         createdVault.ID,
		UserID:          "test-user-001",
		ShareBalance:    decimal.NewFromInt(1000),
		AvgCostPerShare: decimal.NewFromInt(1),
	}

	created, err := svc.CreateVaultShare(ctx, share)
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)

	retrieved, err := svc.GetVaultShare(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, retrieved.ID)
	assert.Equal(t, share.VaultID, retrieved.VaultID)
}

// TestVaultAssetCreation tests vault asset creation and retrieval
func TestVaultAssetCreation(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	asset := &models.VaultAsset{
		VaultID:            createdVault.ID,
		Asset:              "BTC",
		Account:            "Binance Spot",
		Quantity:           decimal.NewFromFloat(0.5),
		AvgCostBasis:       decimal.NewFromInt(20000),
		CurrentPrice:       decimal.NewFromInt(25000),
		CurrentMarketValue: decimal.NewFromInt(12500),
		TargetAllocation:   decimalPtr(decimal.NewFromInt(1)),
	}

	created, err := svc.CreateVaultAsset(ctx, asset)
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)

	retrieved, err := svc.GetVaultAsset(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, retrieved.ID)
	assert.Equal(t, asset.Asset, retrieved.Asset)
}

// TestListVaults tests vault listing with filters
func TestListVaults(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		name := "Test Vault " + string(rune('A'+i))
		vault := &models.Vault{
			Name:                name,
			Type:                models.VaultTypeSingleAsset,
			Status:              models.VaultStatusActive,
			TokenSymbol:         "TEST-VAULT",
			TokenDecimals:       18,
			InitialSharePrice:   decimal.NewFromInt(1),
			MinDepositAmount:    decimal.NewFromInt(1),
			IsDepositAllowed:    true,
			IsWithdrawalAllowed: true,
			InceptionDate:       time.Now(),
			CreatedBy:           "test",
		}

		_, err := svc.CreateVault(ctx, vault)
		require.NoError(t, err)
	}

	vaults, err := svc.ListVaults(ctx, nil)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(vaults), 3)
}

// TestGetVaultShares tests vault share retrieval
func TestGetVaultShares(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	for i := 0; i < 2; i++ {
		uid := "test-user-00" + string(rune('0'+i))
		share := &models.VaultShare{
			VaultID:         createdVault.ID,
			UserID:          uid,
			ShareBalance:    decimal.NewFromInt(1000),
			AvgCostPerShare: decimal.NewFromInt(1),
		}

		_, err := svc.CreateVaultShare(ctx, share)
		require.NoError(t, err)
	}

	shares, err := svc.GetVaultShares(ctx, createdVault.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(shares), 2)
}

// TestTransactionImmutability (sanity check for create + read)
func TestTransactionImmutability(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	tx := &models.VaultTransaction{
		VaultID:       createdVault.ID,
		Type:          models.VaultTxTypeDeposit,
		Status:        "executed",
		AmountUSD:     decimal.NewFromInt(10000),
		Shares:        decimal.NewFromInt(10000),
		PricePerShare: decimal.NewFromInt(1),
		CreatedBy:     "test",
	}

	created, err := svc.CreateTransaction(ctx, tx)
	require.NoError(t, err)

	retrieved, err := svc.GetTransaction(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, retrieved.ID)
}

// TestDepositWithdrawalConsistency tests that deposits and withdrawals maintain consistency
func TestDepositWithdrawalConsistency(t *testing.T) {
	tdb := setupTestDB(t)
	t.Cleanup(func() { tdb.cleanup(t) })
	svc := services.NewVaultServicesConsolidated(tdb.database.DB)
	ctx := context.Background()

	vault := &models.Vault{
		Name:                "Test Vault",
		Type:                models.VaultTypeSingleAsset,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "TEST-VAULT",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now(),
		CreatedBy:           "test",
	}

	createdVault, err := svc.CreateVault(ctx, vault)
	require.NoError(t, err)

	userID := "test-user-001"
	depositAmount := decimal.NewFromInt(10000)

	depositTx, share1, err := svc.ProcessDeposit(
		ctx,
		createdVault.ID,
		userID,
		depositAmount,
		"BTC",
		decimal.NewFromFloat(0.5),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)
	assert.NotNil(t, depositTx)
	assert.NotNil(t, share1)

	withdrawAmount := decimal.NewFromInt(5000)
	withdrawalTx, share2, err := svc.ProcessWithdrawal(
		ctx,
		createdVault.ID,
		userID,
		withdrawAmount,
		"BTC",
		decimal.NewFromFloat(0.25),
		decimal.NewFromInt(20000),
	)
	require.NoError(t, err)
	assert.NotNil(t, withdrawalTx)
	assert.NotNil(t, share2)

	transactions, err := svc.GetVaultTransactions(ctx, createdVault.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(transactions), 4) // deposit + mint + withdrawal + burn
}
