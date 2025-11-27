package models

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func newTestVault() *Vault {
	now := time.Now()
	return &Vault{
		ID:                         "vault_test",
		Name:                       "Test Vault",
		Type:                       VaultTypeSingleAsset,
		Status:                     VaultStatusActive,
		TokenSymbol:                "TVT",
		TokenDecimals:              18,
		TotalSupply:                decimal.NewFromInt(100),
		TotalAssetsUnderManagement: decimal.Zero,
		CurrentSharePrice:          decimal.NewFromInt(1),
		ManualPricePerShare:        decimal.NewFromInt(1),
		InitialSharePrice:          decimal.NewFromInt(1),
		CreatedBy:                  "tester",
		InceptionDate:              now,
		LastUpdated:                now,
	}
}

func TestVault_UpdateManualTotalValue_WithSupply(t *testing.T) {
	vault := newTestVault()

	err := vault.UpdateManualTotalValue(decimal.NewFromInt(250), decimal.Zero, "tester", nil)
	require.NoError(t, err)

	require.True(t, vault.TotalAssetsUnderManagement.Equal(decimal.NewFromInt(250)))
	require.True(t, vault.CurrentSharePrice.Equal(decimal.NewFromFloat(2.5)))
	require.True(t, vault.ManualPricePerShare.Equal(decimal.NewFromFloat(2.5)))
	require.NotNil(t, vault.PriceLastUpdatedAt)
	require.NotNil(t, vault.PriceLastUpdatedBy)
}

func TestVault_UpdateManualTotalValue_ZeroSupplyFallback(t *testing.T) {
	vault := newTestVault()
	vault.TotalSupply = decimal.Zero
	vault.ManualPricePerShare = decimal.NewFromInt(3)
	vault.CurrentSharePrice = decimal.NewFromInt(3)

	err := vault.UpdateManualTotalValue(decimal.NewFromInt(90), decimal.Zero, "tester", nil)
	require.NoError(t, err)

	require.True(t, vault.TotalAssetsUnderManagement.Equal(decimal.NewFromInt(90)))
	require.True(t, vault.CurrentSharePrice.Equal(decimal.NewFromInt(3)))
	require.True(t, vault.ManualPricePerShare.Equal(decimal.NewFromInt(3)))
}

func TestVault_UpdateManualTotalValue_RequiresPositiveValue(t *testing.T) {
	vault := newTestVault()
	errZero := vault.UpdateManualTotalValue(decimal.Zero, decimal.Zero, "tester", nil)
	require.Error(t, errZero)

	errNegative := vault.UpdateManualTotalValue(decimal.NewFromInt(-10), decimal.Zero, "tester", nil)
	require.Error(t, errNegative)
}

func TestVault_UpdateManualTotalValue_RelativePricing(t *testing.T) {
	vault := newTestVault()
	vault.TotalSupply = decimal.Zero

	// Initial contribution of 100 sets baseline and keeps price at initial share price
	err := vault.UpdateManualTotalValue(decimal.NewFromInt(100), decimal.NewFromInt(100), "tester", nil)
	require.NoError(t, err)
	require.True(t, vault.ManualPricingInitialAUM.Equal(decimal.NewFromInt(100)))
	require.True(t, vault.CurrentSharePrice.Equal(vault.InitialSharePrice))

	// 20% growth with no new contributions should raise price proportionally
	err = vault.UpdateManualTotalValue(decimal.NewFromInt(120), decimal.Zero, "tester", nil)
	require.NoError(t, err)
	require.True(t, vault.CurrentSharePrice.Equal(decimal.NewFromFloat(1.2)))

	// Withdraw 20 (reduces capital to 80) while AUM becomes 100 -> price scales to 100/80 = 1.25
	err = vault.UpdateManualTotalValue(decimal.NewFromInt(100), decimal.NewFromInt(-20), "tester", nil)
	require.NoError(t, err)
	require.True(t, vault.ManualPricingInitialAUM.Equal(decimal.NewFromInt(80)))
	require.True(t, vault.CurrentSharePrice.Equal(decimal.NewFromFloat(1.25)))
}
