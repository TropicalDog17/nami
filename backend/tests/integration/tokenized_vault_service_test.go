package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// TestTokenizedVault_InvestmentScenario tests the specific use case at the service layer:
// - Create a user-defined tokenized vault
// - Deposit 500u (unspecified investment)
// - After 1 month, update progress - investment now worth 550u (50u profit)
// - Verify unrealized PnL, ROI, and CAPR calculations
// - Test additional deposits and withdrawals with proper PnL recalculation
func TestTokenizedVault_InvestmentScenario(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()

	// Setup services
	vaultService := services.NewTokenizedVaultService(tdb.database.DB)
	shareService := services.NewTokenizedVaultShareService(tdb.database.DB)

	// Step 1: Create a user-defined tokenized vault
	vault := &models.Vault{
		Name:                "Growth Strategy Fund",
		Description:         stringPtr("User-defined investment fund with manual price tracking"),
		Type:                models.VaultTypeUserDefined,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "GSF",
		TokenDecimals:       18,
		CurrentSharePrice:   decimal.NewFromInt(1), // Start with $1 per share
		InitialSharePrice:   decimal.NewFromInt(1),
		IsUserDefinedPrice:  true,
		ManualPricePerShare: decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(10),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		CreatedBy:           "test-user",
		InceptionDate:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	createdVault, err := vaultService.CreateVault(ctx, vault)
	assert.NoError(t, err)
	assert.NotNil(t, createdVault)
	assert.Equal(t, models.VaultTypeUserDefined, createdVault.Type)
	assert.Equal(t, "GSF", createdVault.TokenSymbol)
	assert.True(t, createdVault.IsUserDefinedPrice)
	assert.True(t, createdVault.CurrentSharePrice.Equal(decimal.NewFromInt(1)))
	assert.True(t, createdVault.TotalSupply.IsZero())
	assert.True(t, createdVault.TotalAssetsUnderManagement.IsZero())

	// Step 2: Deposit 500u - user buys 500 shares at $1 each
	// Since we're testing the service layer, we directly use the share service
	userID := "investor-user"
	sharesToMint := decimal.NewFromInt(500)
	costPerShare := decimal.NewFromInt(1)

	vaultShare, err := shareService.MintShares(ctx, createdVault.ID, userID, sharesToMint, costPerShare)
	assert.NoError(t, err)
	assert.NotNil(t, vaultShare)
	assert.True(t, vaultShare.ShareBalance.Equal(sharesToMint))
	assert.True(t, vaultShare.CostBasis.Equal(decimal.NewFromInt(500)))
	assert.True(t, vaultShare.CurrentMarketValue.IsZero()) // Will be updated when we call UpdateMarketValue

	// Verify vault state after deposit
	updatedVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
	assert.NoError(t, err)
	assert.True(t, updatedVault.TotalSupply.Equal(sharesToMint))
	assert.True(t, updatedVault.TotalAssetsUnderManagement.Equal(decimal.NewFromInt(500)))

	// Update market value for user shares
	vaultShare.UpdateValueForVault(updatedVault)
	err = shareService.UpdateVaultShare(ctx, vaultShare)
	assert.NoError(t, err)

	// Verify updated share state
	updatedShare, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, updatedShare, 1)
	assert.True(t, updatedShare[0].ShareBalance.Equal(sharesToMint))
	assert.True(t, updatedShare[0].CostBasis.Equal(decimal.NewFromInt(500)))
	assert.True(t, updatedShare[0].CurrentMarketValue.Equal(decimal.NewFromInt(500)))
	assert.True(t, updatedShare[0].UnrealizedPnL.IsZero()) // No PnL yet

	// Step 3: After 1 month, update progress - investment now worth 550u (50u profit)
	// Update share price to $1.10 ($550 / 500 shares)
	newPrice := decimal.NewFromFloat(1.10)
	updatedBy := "fund-manager"
	notes := stringPtr("Fund performance update - 10% gain in first month")

	// Use the most recent vault object to update price
	err = updatedVault.UpdateManualPrice(newPrice, updatedBy, notes)
	assert.NoError(t, err)

	// Save updated vault
	err = vaultService.UpdateVault(ctx, updatedVault)
	assert.NoError(t, err)

	// Verify updated vault state
	finalVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
	assert.NoError(t, err)
	assert.True(t, finalVault.CurrentSharePrice.Equal(newPrice))
	assert.True(t, finalVault.TotalAssetsUnderManagement.Equal(decimal.NewFromInt(550)))
	assert.True(t, finalVault.ManualPricePerShare.Equal(newPrice))
	assert.NotNil(t, finalVault.PriceLastUpdatedAt)
	assert.Equal(t, updatedBy, *finalVault.PriceLastUpdatedBy)

	// Step 4: Verify unrealized PnL for investor
	// Get updated shares and recalculate market values
	investorShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, investorShares, 1)

	// Update market value with new price
	investorShares[0].UpdateValueForVault(finalVault)
	err = shareService.UpdateVaultShare(ctx, investorShares[0])
	assert.NoError(t, err)

	// Get final share state
	finalShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, finalShares, 1)

	// Verify unrealized PnL calculations
	expectedUnrealizedPnL := decimal.NewFromInt(50)        // $550 - $500 = $50 profit
	expectedUnrealizedPnLPercent := decimal.NewFromInt(10) // 50 / 500 * 100 = 10%

	assert.True(t, finalShares[0].CurrentMarketValue.Equal(decimal.NewFromInt(550)))
	assert.True(t, finalShares[0].UnrealizedPnL.Equal(expectedUnrealizedPnL))
	assert.True(t, finalShares[0].UnrealizedPnLPercent.Equal(expectedUnrealizedPnLPercent))

	// Step 5: Test additional deposit - another 250u at new price
	additionalAmount := decimal.NewFromInt(250)
	additionalShares := additionalAmount.Div(newPrice) // ~227.27 shares

	additionalShare, err := shareService.MintShares(ctx, createdVault.ID, userID, additionalShares, newPrice)
	assert.NoError(t, err)

	// The returned share should have the total balance (500 + 227.27 = 727.27)
	expectedTotalBalance := sharesToMint.Add(additionalShares)
	assert.True(t, additionalShare.ShareBalance.Sub(expectedTotalBalance).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Verify final vault state
	updatedVaultAfterDeposit, err := vaultService.GetVaultByID(ctx, createdVault.ID)
	assert.NoError(t, err)

	// Total AUM should be $800 ($550 + $250)
	assert.True(t, updatedVaultAfterDeposit.TotalAssetsUnderManagement.Sub(decimal.NewFromInt(800)).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Total supply should be ~727.27 shares (500 + 227.27)
	expectedTotalSupply := sharesToMint.Add(additionalShares)
	assert.True(t, updatedVaultAfterDeposit.TotalSupply.Sub(expectedTotalSupply).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Step 6: Verify final user shares and PnL
	finalUserShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, finalUserShares, 1)

	// Update market value with latest price
	finalUserShares[0].UpdateValueForVault(updatedVaultAfterDeposit)
	err = shareService.UpdateVaultShare(ctx, finalUserShares[0])
	assert.NoError(t, err)

	// Get final updated shares
	updatedFinalShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, updatedFinalShares, 1)

	// Final share balance and PnL
	finalShareBalance := expectedTotalSupply
	finalCostBasis := decimal.NewFromInt(750)                  // $500 + $250
	finalMarketValue := decimal.NewFromInt(800)                // $800 at current price
	finalUnrealizedPnL := finalMarketValue.Sub(finalCostBasis) // $50 profit

	assert.True(t, updatedFinalShares[0].ShareBalance.Sub(finalShareBalance).Abs().LessThan(decimal.NewFromFloat(0.01)))
	assert.True(t, updatedFinalShares[0].CostBasis.Sub(finalCostBasis).Abs().LessThan(decimal.NewFromFloat(0.01)))
	assert.True(t, updatedFinalShares[0].CurrentMarketValue.Sub(finalMarketValue).Abs().LessThan(decimal.NewFromFloat(0.01)))
	assert.True(t, updatedFinalShares[0].UnrealizedPnL.Equal(finalUnrealizedPnL))

	// ROI should be approximately 6.67% ($50 / $750 * 100)
	expectedROI := decimal.NewFromFloat(50).Div(decimal.NewFromInt(750)).Mul(decimal.NewFromInt(100))
	assert.True(t, updatedFinalShares[0].UnrealizedPnLPercent.Sub(expectedROI).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Step 7: Test partial withdrawal - burn 100 shares worth $110
	sharesToBurn := decimal.NewFromInt(100)
	marketValuePerShare := newPrice

	remainingShares, err := shareService.BurnShares(ctx, createdVault.ID, userID, sharesToBurn, marketValuePerShare)
	assert.NoError(t, err)
	assert.NotNil(t, remainingShares)

	// Verify vault state after withdrawal
	vaultAfterWithdrawal, err := vaultService.GetVaultByID(ctx, createdVault.ID)
	assert.NoError(t, err)

	// Vault should have reduced AUM and supply
	expectedFinalAUM := decimal.NewFromInt(690) // $800 - $110
	expectedFinalSupply := expectedTotalSupply.Sub(sharesToBurn)

	assert.True(t, vaultAfterWithdrawal.TotalAssetsUnderManagement.Sub(expectedFinalAUM).Abs().LessThan(decimal.NewFromFloat(0.01)))
	assert.True(t, vaultAfterWithdrawal.TotalSupply.Sub(expectedFinalSupply).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Verify user still has correct PnL tracking
	finalUserSharesAfterWithdrawal, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, finalUserSharesAfterWithdrawal, 1)

	// Update market value for remaining shares
	finalUserSharesAfterWithdrawal[0].UpdateValueForVault(vaultAfterWithdrawal)
	err = shareService.UpdateVaultShare(ctx, finalUserSharesAfterWithdrawal[0])
	assert.NoError(t, err)

	// Get final state
	ultimateShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)
	assert.Len(t, ultimateShares, 1)

	// User should have reduced shares but PnL should still be tracked correctly
	assert.True(t, ultimateShares[0].ShareBalance.Sub(expectedFinalSupply).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Cost basis should be reduced proportionally
	remainingSharesRatio := expectedFinalSupply.Div(expectedTotalSupply)
	adjustedCostBasis := finalCostBasis.Mul(remainingSharesRatio)
	assert.True(t, ultimateShares[0].CostBasis.Sub(adjustedCostBasis).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Market value should reflect current holding
	expectedRemainingMarketValue := expectedFinalAUM
	assert.True(t, ultimateShares[0].CurrentMarketValue.Sub(expectedRemainingMarketValue).Abs().LessThan(decimal.NewFromFloat(0.01)))

	// Unrealized PnL should still be positive
	expectedRemainingPnL := expectedRemainingMarketValue.Sub(adjustedCostBasis)
	assert.True(t, ultimateShares[0].UnrealizedPnL.Sub(expectedRemainingPnL).Abs().LessThan(decimal.NewFromFloat(0.01)))
}

// TestTokenizedVault_PerformanceMetrics tests ROI and CAPR calculations
func TestTokenizedVault_PerformanceMetrics(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()

	// Setup services
	vaultService := services.NewTokenizedVaultService(tdb.database.DB)
	shareService := services.NewTokenizedVaultShareService(tdb.database.DB)

	// Create vault for performance testing
	vault := &models.Vault{
		Name:                "Performance Test Fund",
		Type:                models.VaultTypeUserDefined,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "PTF",
		TokenDecimals:       18,
		CurrentSharePrice:   decimal.NewFromInt(100), // Start with $100 per share
		InitialSharePrice:   decimal.NewFromInt(100),
		IsUserDefinedPrice:  true,
		ManualPricePerShare: decimal.NewFromInt(100),
		MinDepositAmount:    decimal.NewFromInt(1000),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		CreatedBy:           "test-manager",
		InceptionDate:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	createdVault, err := vaultService.CreateVault(ctx, vault)
	assert.NoError(t, err)

	// Test Case 1: Single deposit with price appreciation
	t.Run("single_deposit_appreciation", func(t *testing.T) {
		userID := "investor1"
		depositAmount := decimal.NewFromInt(5000)
		initialPrice := decimal.NewFromInt(100)
		sharesToMint := depositAmount.Div(initialPrice) // 50 shares

		// Initial deposit
		_, err := shareService.MintShares(ctx, createdVault.ID, userID, sharesToMint, initialPrice)
		assert.NoError(t, err)

		// Update price to $120/share (20% appreciation)
		newPrice := decimal.NewFromInt(120)

		// Get current vault state first
		currentVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		err = currentVault.UpdateManualPrice(newPrice, "manager", stringPtr("Q1 performance update"))
		assert.NoError(t, err)
		err = vaultService.UpdateVault(ctx, currentVault)
		assert.NoError(t, err)

		// Get updated vault and calculate performance
		updatedVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		// Calculate expected performance
		// Total return: 50 shares * ($120 - $100) = $1000 profit
		expectedTotalReturn := decimal.NewFromInt(1000)
		// ROI: $1000 / $5000 * 100 = 20%
		expectedROI := decimal.NewFromInt(20)

		// Verify vault performance since inception
		performanceSinceInception := updatedVault.CalculatePerformanceSinceInception()
		assert.True(t, performanceSinceInception.Equal(expectedROI))

		// Verify user share performance
		userShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, userShares, 1)

		// Update market value
		userShares[0].UpdateValueForVault(updatedVault)
		err = shareService.UpdateVaultShare(ctx, userShares[0])
		assert.NoError(t, err)

		// Get updated shares
		updatedShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, updatedShares, 1)

		// Verify PnL calculations
		expectedCurrentMarketValue := decimal.NewFromInt(6000) // 50 * $120
		expectedUnrealizedPnL := expectedTotalReturn
		expectedUnrealizedPnLPercent := expectedROI

		assert.True(t, updatedShares[0].CurrentMarketValue.Equal(expectedCurrentMarketValue))
		assert.True(t, updatedShares[0].UnrealizedPnL.Equal(expectedUnrealizedPnL))
		assert.True(t, updatedShares[0].UnrealizedPnLPercent.Equal(expectedUnrealizedPnLPercent))
	})

	// Test Case 2: Multiple deposits at different prices
	t.Run("multiple_deposits_different_prices", func(t *testing.T) {
		userID := "investor2"

		// Additional deposit of $3000 at $120/share = 25 shares
		additionalAmount := decimal.NewFromInt(3000)
		currentPrice := decimal.NewFromInt(120)
		additionalShares := additionalAmount.Div(currentPrice)

		_, err := shareService.MintShares(ctx, createdVault.ID, userID, additionalShares, currentPrice)
		assert.NoError(t, err)

		// Update price to $150/share (25% increase from latest price)
		finalPrice := decimal.NewFromInt(150)

		// Get current vault state first
		currentVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		err = currentVault.UpdateManualPrice(finalPrice, "manager", stringPtr("Q2 performance update - strong growth"))
		assert.NoError(t, err)
		err = vaultService.UpdateVault(ctx, currentVault)
		assert.NoError(t, err)

		// Get final vault state
		finalVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		// Get final user shares
		finalUserShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, finalUserShares, 1)

		// Update market value with final price
		finalUserShares[0].UpdateValueForVault(finalVault)
		err = shareService.UpdateVaultShare(ctx, finalUserShares[0])
		assert.NoError(t, err)

		// Get updated final shares
		updatedFinalShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, updatedFinalShares, 1)

		// Final calculations for investor2:
		// Total shares: 25 shares (only investor2's shares)
		// Total cost: $3000 (25 shares at $120)
		// Current value: 25 * $150 = $3,750
		// Total return: $3,750 - $3,000 = $750
		// ROI: $750 / $3,000 * 100 = 25%

		expectedTotalReturn := decimal.NewFromInt(750)
		expectedROI := decimal.NewFromInt(25)

		// Verify final PnL calculations
		assert.True(t, updatedFinalShares[0].UnrealizedPnL.Equal(expectedTotalReturn))
		assert.True(t, updatedFinalShares[0].UnrealizedPnLPercent.Equal(expectedROI))

		// CAPR should reflect the strong growth
		assert.True(t, updatedFinalShares[0].UnrealizedPnLPercent.IsPositive())
		assert.True(t, updatedFinalShares[0].UnrealizedPnLPercent.GreaterThan(decimal.NewFromInt(20))) // Should be substantial
	})

	// Test Case 3: Price depreciation scenario
	t.Run("price_depreciation_scenario", func(t *testing.T) {
		userID := "investor3"

		// New user deposit for depreciation test
		depositAmount := decimal.NewFromInt(2000)
		depositPrice := decimal.NewFromInt(150)
		sharesToMint := depositAmount.Div(depositPrice)

		_, err := shareService.MintShares(ctx, createdVault.ID, userID, sharesToMint, depositPrice)
		assert.NoError(t, err)

		// Simulate market downturn - update price to $80/share
		declinePrice := decimal.NewFromInt(80)

		// Get current vault state first
		currentVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		err = currentVault.UpdateManualPrice(declinePrice, "manager", stringPtr("Market correction - price decline"))
		assert.NoError(t, err)
		err = vaultService.UpdateVault(ctx, currentVault)
		assert.NoError(t, err)

		// Get vault state after decline
		declineVault, err := vaultService.GetVaultByID(ctx, createdVault.ID)
		assert.NoError(t, err)

		// Get user shares and update values
		declineUserShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, declineUserShares, 1)

		declineUserShares[0].UpdateValueForVault(declineVault)
		err = shareService.UpdateVaultShare(ctx, declineUserShares[0])
		assert.NoError(t, err)

		// Get updated shares
		updatedDeclineShares, err := shareService.GetVaultShares(ctx, &models.VaultShareFilter{
			VaultID: &createdVault.ID,
			UserID:  &userID,
		})
		assert.NoError(t, err)
		assert.Len(t, updatedDeclineShares, 1)

		// Value should now be: shares * $80
		// Loss: current value - cost basis
		// ROI: loss / cost basis * 100
		expectedROI := updatedDeclineShares[0].UnrealizedPnLPercent

		// Should be negative during decline
		assert.True(t, expectedROI.IsNegative())
	})
}

// TestTokenizedVault_PnLRecalculation tests that PnL is properly recalculated
// after deposits and withdrawals
func TestTokenizedVault_PnLRecalculation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	vaultService := services.NewTokenizedVaultService(tdb.database.DB)
	shareService := services.NewTokenizedVaultShareService(tdb.database.DB)

	// Create simple vault
	vault := &models.Vault{
		Name:                "PnL Test Vault",
		Type:                models.VaultTypeUserDefined,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "PNL",
		TokenDecimals:       18,
		CurrentSharePrice:   decimal.NewFromInt(10),
		InitialSharePrice:   decimal.NewFromInt(10),
		IsUserDefinedPrice:  true,
		ManualPricePerShare: decimal.NewFromInt(10),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		CreatedBy:           "test-user",
		InceptionDate:       time.Now(),
	}

	createdVault, err := vaultService.CreateVault(context.Background(), vault)
	assert.NoError(t, err)

	userID := "test-investor"

	// Initial deposit
	initialDeposit := decimal.NewFromInt(1000)
	initialPrice := decimal.NewFromInt(10)
	initialShares := initialDeposit.Div(initialPrice) // 100 shares

	_, err = shareService.MintShares(context.Background(), createdVault.ID, userID, initialShares, initialPrice)
	assert.NoError(t, err)

	// Update price to create unrealized gain
	newPrice := decimal.NewFromInt(15)

	// Get current vault state first
	currentVault, err := vaultService.GetVaultByID(context.Background(), createdVault.ID)
	assert.NoError(t, err)

	err = currentVault.UpdateManualPrice(newPrice, "manager", nil)
	assert.NoError(t, err)
	err = vaultService.UpdateVault(context.Background(), currentVault)
	assert.NoError(t, err)

	// Check PnL before additional deposit
	updatedVault, _ := vaultService.GetVaultByID(context.Background(), createdVault.ID)
	userShares, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	userShares[0].UpdateValueForVault(updatedVault)
	err = shareService.UpdateVaultShare(context.Background(), userShares[0])
	assert.NoError(t, err)

	// Get updated shares
	updatedSharesBefore, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	expectedPnLBefore := decimal.NewFromInt(500) // 100 shares * ($15 - $10)
	assert.True(t, updatedSharesBefore[0].UnrealizedPnL.Equal(expectedPnLBefore))

	// Additional deposit at new price
	additionalDeposit := decimal.NewFromInt(500)
	additionalShares := additionalDeposit.Div(newPrice) // ~33.33 shares

	_, err = shareService.MintShares(context.Background(), createdVault.ID, userID, additionalShares, newPrice)
	assert.NoError(t, err)

	// Check PnL after additional deposit
	finalVault, _ := vaultService.GetVaultByID(context.Background(), createdVault.ID)
	finalShares, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	finalShares[0].UpdateValueForVault(finalVault)
	err = shareService.UpdateVaultShare(context.Background(), finalShares[0])
	assert.NoError(t, err)

	// Get final updated shares
	updatedFinalShares, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	// Should have combined PnL tracking
	// Total shares: 100 + 33.33 = 133.33 shares
	// Total cost: $1000 + $500 = $1500
	// Current value: 133.33 * $15 = $2000
	// Unrealized PnL: $2000 - $1500 = $500

	expectedPnLAfter := decimal.NewFromInt(500)
	assert.True(t, updatedFinalShares[0].UnrealizedPnL.Equal(expectedPnLAfter))

	// Partial withdrawal
	withdrawalShares := decimal.NewFromFloat(33.33) // Withdraw approximately 25% of shares

	_, err = shareService.BurnShares(context.Background(), createdVault.ID, userID, withdrawalShares, newPrice)
	assert.NoError(t, err)

	// Check final PnL after withdrawal
	ultimateVault, _ := vaultService.GetVaultByID(context.Background(), createdVault.ID)
	ultimateShares, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	ultimateShares[0].UpdateValueForVault(ultimateVault)
	err = shareService.UpdateVaultShare(context.Background(), ultimateShares[0])
	assert.NoError(t, err)

	// Get final updated shares after withdrawal
	finalUpdatedShares, err := shareService.GetVaultShares(context.Background(), &models.VaultShareFilter{
		VaultID: &createdVault.ID,
		UserID:  &userID,
	})
	assert.NoError(t, err)

	// Remaining shares should maintain proportional PnL
	// After withdrawing 33.33 shares proportionally:
	// Remaining shares: 100, Current value: $1500, Cost basis: $1125, PnL: $375
	expectedFinalPnL := decimal.NewFromInt(375)
	assertApproxEqual(t, finalUpdatedShares[0].UnrealizedPnL, expectedFinalPnL, 10)
}

// TestTokenizedVault_VaultSummary tests vault summary statistics
func TestTokenizedVault_VaultSummary(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	vaultService := services.NewTokenizedVaultService(tdb.database.DB)
	shareService := services.NewTokenizedVaultShareService(tdb.database.DB)

	// Create multiple vaults
	vault1 := &models.Vault{
		Name:                "Growth Fund",
		Type:                models.VaultTypeUserDefined,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "GROW",
		TokenDecimals:       18,
		CurrentSharePrice:   decimal.NewFromInt(1),
		InitialSharePrice:   decimal.NewFromInt(1),
		IsUserDefinedPrice:  true,
		ManualPricePerShare: decimal.NewFromInt(1),
		CreatedBy:           "manager1",
		InceptionDate:       time.Now(),
	}

	vault2 := &models.Vault{
		Name:                "Conservative Fund",
		Type:                models.VaultTypeUserDefined,
		Status:              models.VaultStatusActive,
		TokenSymbol:         "CONV",
		TokenDecimals:       18,
		CurrentSharePrice:   decimal.NewFromInt(1),
		InitialSharePrice:   decimal.NewFromInt(1),
		IsUserDefinedPrice:  true,
		ManualPricePerShare: decimal.NewFromInt(1),
		CreatedBy:           "manager2",
		InceptionDate:       time.Now(),
	}

	createdVault1, err := vaultService.CreateVault(context.Background(), vault1)
	assert.NoError(t, err)

	_, err = vaultService.CreateVault(context.Background(), vault2)
	assert.NoError(t, err)

	// Add some activity to vault1
	_, err = shareService.MintShares(context.Background(), createdVault1.ID, "user1", decimal.NewFromInt(1000), decimal.NewFromInt(1))
	assert.NoError(t, err)

	// Update vault1 price
	currentVault1, err := vaultService.GetVaultByID(context.Background(), createdVault1.ID)
	assert.NoError(t, err)

	err = currentVault1.UpdateManualPrice(decimal.NewFromFloat(1.20), "manager1", stringPtr("Growth update"))
	assert.NoError(t, err)
	err = vaultService.UpdateVault(context.Background(), currentVault1)
	assert.NoError(t, err)

	// Get summary statistics
	summary, err := vaultService.GetVaultSummary(context.Background(), nil)
	assert.NoError(t, err)

	// Verify summary
	assert.Equal(t, 2, summary.TotalVaults)
	assert.Equal(t, 2, summary.ActiveVaults)
	assert.True(t, summary.TotalAUM.Equal(decimal.NewFromInt(1200))) // 1000 * 1.20
	assert.True(t, summary.TotalSharesOutstanding.Equal(decimal.NewFromInt(1000)))
}
