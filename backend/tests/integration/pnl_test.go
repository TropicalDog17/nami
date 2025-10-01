package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// TestPnL_Calculation tests the PnL calculation functionality
func TestPnL_Calculation(t *testing.T) {
	container := GetSuiteContainer(t)
	defer container.Cleanup(t)

	ctx := context.Background()
	database := &db.DB{DB: container.DB}

	// Setup services
	txService := services.NewTransactionService(database)
	linkService := services.NewLinkService(database)
	actionService := services.NewActionServiceFull(database, txService, linkService, nil)
	reportingService := services.NewReportingService(database)

	t.Run("Stake_Unstake_CloseAll_Profit", func(t *testing.T) {
		// Test stake-unstake with close all resulting in profit
		// Stake 1000 USDT at $1.00, unstake all at $1.20 = $200 profit

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-01-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             1000.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		require.Len(t, stakeResp.Transactions, 2) // withdraw + transfer_in

		depositTxID := stakeResp.Transactions[0].ID // The withdraw transaction

		// Perform unstake with close_all = true, higher price (profit scenario)
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-02-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              1000.0, // This should be ignored due to close_all
				"exit_price_usd":      1.2,    // 20% profit
				"stake_deposit_tx_id": depositTxID,
				"close_all":           true,
			},
		}

		unstakeResp, err := actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)
		require.Len(t, unstakeResp.Transactions, 2) // withdraw + transfer_in

		// Get PnL report
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Expected: Exit $1200 - Entry $1000 = $200 profit
		expectedPnL := decimal.NewFromInt(200)
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be $200 profit")

		// Expected ROI: $200 / $1000 * 100% = 20%
		expectedROI := decimal.NewFromInt(20)
		assert.Equal(t, expectedROI, pnlReport.ROIPercent, "ROI should be 20%")
	})

	t.Run("Stake_Unstake_CloseAll_Loss", func(t *testing.T) {
		// Test stake-unstake with close all resulting in loss
		// Stake 500 USDT at $1.00, unstake all at $0.55 = $225 loss (reproducing your scenario)

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-03-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             500.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// Perform unstake with close_all = true, lower price (loss scenario)
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-04-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              275.0, // This should be ignored due to close_all
				"exit_price_usd":      0.55,  // Represents 45% loss
				"stake_deposit_tx_id": depositTxID,
				"close_all":           true,
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)

		// Get PnL report
		period := models.Period{
			StartDate: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 4, 30, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Expected: Exit $275 - Entry $500 = -$225 loss
		expectedPnL := decimal.NewFromInt(-225)
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be $225 loss")

		// Expected ROI: -$225 / $500 * 100% = -45%
		expectedROI := decimal.NewFromInt(-45)
		assert.Equal(t, expectedROI, pnlReport.ROIPercent, "ROI should be -45%")
	})

	t.Run("Stake_Unstake_Partial_NoGain", func(t *testing.T) {
		// Test partial unstake - PnL should NOT be recognized until position is fully closed
		// Stake 1000 USDT at $1.00, unstake 300 at $1.00 = no PnL recognized (position not fully closed)

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-05-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             1000.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// Perform partial unstake, close_all = false, same price (no gain/loss)
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-06-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              300.0, // Partial unstake
				"exit_price_usd":      1.0,   // Same price, no gain/loss
				"stake_deposit_tx_id": depositTxID,
				"close_all":           false, // Not close all
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)

		// Get PnL report
		period := models.Period{
			StartDate: time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 6, 30, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Expected: $0 PnL because position is not fully closed yet
		expectedPnL := decimal.Zero
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be zero for partial unstake (position not fully closed)")

		// Expected ROI: 0% because no PnL recognized yet
		expectedROI := decimal.Zero
		assert.Equal(t, expectedROI, pnlReport.ROIPercent, "ROI should be 0% when position not fully closed")
	})

	t.Run("Multiple_Partial_Unstakes_FinalClose", func(t *testing.T) {
		// Test multiple partial unstakes with final close_all to recognize PnL
		// Stake 1000 at $1.00, unstake 300 at $1.10, 400 at $1.20, final 300 at $0.90 with close_all

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-07-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             1000.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// First partial unstake - 300 at $1.10 (no PnL recognized yet)
		unstakeReq1 := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-08-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              300.0,
				"exit_price_usd":      1.10,
				"stake_deposit_tx_id": depositTxID,
				"close_all":           false,
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq1)
		require.NoError(t, err)

		// Second partial unstake - 400 at $1.20 (no PnL recognized yet)
		unstakeReq2 := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-09-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              400.0,
				"exit_price_usd":      1.20,
				"stake_deposit_tx_id": depositTxID,
				"close_all":           false,
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq2)
		require.NoError(t, err)

		// Final unstake with close_all - remaining 300 at $0.90 (PnL now recognized)
		unstakeReq3 := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-10-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              300.0,
				"exit_price_usd":      0.90,
				"stake_deposit_tx_id": depositTxID,
				"close_all":           true, // Mark position as closed
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq3)
		require.NoError(t, err)

		// Get PnL report
		period := models.Period{
			StartDate: time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 10, 31, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Expected PnL calculation (only recognized when position fully closed):
		// 1. 300 × ($1.10 - $1.00) = $30 gain
		// 2. 400 × ($1.20 - $1.00) = $80 gain
		// 3. 300 × ($0.90 - $1.00) = -$30 loss
		// Total: $30 + $80 - $30 = $80 gain
		expectedPnL := decimal.NewFromInt(80)
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be $80 when position fully closed")

		// Expected cost basis: full $1000 (recognized when position closed)
		// Expected ROI: $80 / $1000 * 100% = 8%
		expectedROI := decimal.NewFromFloat(8)
		assert.Equal(t, expectedROI, pnlReport.ROIPercent, "ROI should be 8% when position fully closed")
	})

	t.Run("Partial_Unstake_WithGain_NoPnLUntilClosed", func(t *testing.T) {
		// Test that partial unstakes with gains don't realize PnL until position is fully closed
		// Stake 1000 at $1.00, partial unstake 300 at $1.50 (50% gain), but no PnL until fully closed

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-11-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             1000.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// Partial unstake with gain, but no close_all
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-12-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              300.0,  // Partial unstake
				"exit_price_usd":      1.50,   // 50% gain on this portion
				"stake_deposit_tx_id": depositTxID,
				"close_all":           false,  // Not fully closed yet
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)

		// Get PnL report - should show zero PnL since position not fully closed
		period := models.Period{
			StartDate: time.Date(2025, 11, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Should be zero PnL even though there was a 50% gain on partial unstake
		expectedPnL := decimal.Zero
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be zero despite gain on partial unstake (position not fully closed)")

		expectedROI := decimal.Zero
		assert.Equal(t, expectedROI, pnlReport.ROIPercent, "ROI should be 0% when position not fully closed")
	})

	t.Run("Regression_CloseAll_IgnoresAmountParam", func(t *testing.T) {
		// Regression test to ensure close_all ignores the amount parameter
		// and always uses the full stake amount

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-11-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             800.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// Perform unstake with close_all = true, but amount parameter set to wrong value
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-12-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              100.0, // Wrong amount - should be ignored
				"exit_price_usd":      1.25,  // 25% profit
				"stake_deposit_tx_id": depositTxID,
				"close_all":           true, // Should use full 800, not 100
			},
		}

		// Perform the unstake action
		unstakeResp, err := actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)

		// Verify the withdraw transaction amount is the full stake amount
		withdrawTx, err := txService.GetTransaction(ctx, unstakeResp.Transactions[0].ID)
		require.NoError(t, err)
		assert.Equal(t, decimal.NewFromInt(800), withdrawTx.Quantity, "Close all should unstake full 800, ignoring amount param of 100")

		// Get PnL report
		period := models.Period{
			StartDate: time.Date(2025, 11, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Expected: Exit $1000 (800 × 1.25) - Entry $800 = $200 profit
		// NOT: Exit $125 (100 × 1.25) - Entry $100 = $25 profit
		expectedPnL := decimal.NewFromInt(200)
		assert.Equal(t, expectedPnL, pnlReport.RealizedPnLUSD, "PnL should be based on full 800 amount, not the 100 parameter")
	})

	t.Run("No_StakeUnstake_Transactions", func(t *testing.T) {
		// Test PnL report when there are no stake-unstake transactions in period

		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Should all be zero when no stake-unstake transactions
		assert.Equal(t, decimal.Zero, pnlReport.RealizedPnLUSD)
		assert.Equal(t, decimal.Zero, pnlReport.RealizedPnLVND)
		assert.Equal(t, decimal.Zero, pnlReport.UnrealizedPnLUSD)
		assert.Equal(t, decimal.Zero, pnlReport.UnrealizedPnLVND)
		assert.Equal(t, decimal.Zero, pnlReport.TotalPnLUSD)
		assert.Equal(t, decimal.Zero, pnlReport.TotalPnLVND)
		assert.Equal(t, decimal.Zero, pnlReport.ROIPercent)
	})
}

// TestPnL_CloseAll_Mechanics tests the specific mechanics of close_all functionality
func TestPnL_CloseAll_Mechanics(t *testing.T) {
	container := GetSuiteContainer(t)
	defer container.Cleanup(t)

	ctx := context.Background()
	database := &db.DB{DB: container.DB}

	// Setup services
	txService := services.NewTransactionService(database)
	linkService := services.NewLinkService(database)
	actionService := services.NewActionServiceFull(database, txService, linkService, nil)

	t.Run("CloseAll_SetsExitDate", func(t *testing.T) {
		// Test that close_all properly sets the exit_date on the original stake deposit

		// Perform stake
		stakeReq := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-01-01",
				"source_account":     "Binance Spot",
				"investment_account": "Futures",
				"asset":              "USDT",
				"amount":             500.0,
			},
		}

		stakeResp, err := actionService.Perform(ctx, stakeReq)
		require.NoError(t, err)
		depositTxID := stakeResp.Transactions[0].ID

		// Verify deposit doesn't have exit_date initially
		depositTx, err := txService.GetTransaction(ctx, depositTxID)
		require.NoError(t, err)
		assert.Nil(t, depositTx.ExitDate, "Deposit should not have exit_date initially")

		// Perform unstake with close_all = true
		unstakeReq := &models.ActionRequest{
			Action: models.ActionUnstake,
			Params: map[string]interface{}{
				"date":                "2025-02-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              500.0,
				"exit_price_usd":      1.1,
				"stake_deposit_tx_id": depositTxID,
				"close_all":           true,
			},
		}

		_, err = actionService.Perform(ctx, unstakeReq)
		require.NoError(t, err)

		// Verify deposit now has exit_date set
		updatedDepositTx, err := txService.GetTransaction(ctx, depositTxID)
		require.NoError(t, err)
		require.NotNil(t, updatedDepositTx.ExitDate, "Deposit should have exit_date after close_all")

		expectedExitDate := time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)
		assert.Equal(t, expectedExitDate, *updatedDepositTx.ExitDate, "Exit date should match unstake date")
	})

	t.Run("CloseAll_WithoutExitDate_Fallback", func(t *testing.T) {
		// Test PnL calculation when exit_date is not set (fallback to proportional)

		// Create manual transactions to simulate old data without close_all
		depositTx := &models.Transaction{
			Date:       time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			Type:       "withdraw",
			Asset:      "USDT",
			Account:    "Futures",
			Quantity:   decimal.NewFromInt(600),
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromInt(1),
			FXToVND:    decimal.NewFromInt(25000),
		}

		err := txService.CreateTransaction(ctx, depositTx)
		require.NoError(t, err)

		withdrawTx := &models.Transaction{
			Date:       time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC),
			Type:       "withdraw",
			Asset:      "USDT",
			Account:    "Futures",
			Quantity:   decimal.NewFromInt(300),
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromInt(1),
			FXToVND:    decimal.NewFromInt(25000),
		}

		err = txService.CreateTransaction(ctx, withdrawTx)
		require.NoError(t, err)

		// Create link but don't set exit_date (simulating old data)
		err = linkService.CreateLink(ctx, &models.TransactionLink{
			LinkType: "stake_unstake",
			FromTx:   depositTx.ID,
			ToTx:     withdrawTx.ID,
		})
		require.NoError(t, err)

		// Test PnL calculation
		reportingService := services.NewReportingService(database)
		period := models.Period{
			StartDate: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 4, 30, 0, 0, 0, 0, time.UTC),
		}

		pnlReport, err := reportingService.GetPnL(ctx, period)
		require.NoError(t, err)

		// Should use proportional calculation since no exit_date
		// Expected: Exit $300 - Cost Basis $300 = $0 (same price)
		assert.Equal(t, decimal.Zero, pnlReport.RealizedPnLUSD, "Should use proportional calculation when no exit_date")
	})
}
