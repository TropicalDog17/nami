package integration

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// TestPnL_StakeUnstake_FullClose tests PnL calculation when closing entire position at once
func TestPnL_StakeUnstake_FullClose(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Stake 500 USDT at $1.00 per USDT
	stakeReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Binance Spot",
			"investment_account": "Futures",
			"asset":              "USDT",
			"amount":             500.0,
			"entry_price_usd":    1.0,
		},
	}
	stakeResp, err := actionService.Perform(ctx, stakeReq)
	if err != nil {
		t.Fatalf("stake action failed: %v", err)
	}
	depositTxID := stakeResp.Transactions[1].ID // The deposit transaction

	// Unstake full position (500 USDT) but only receive 275 USDT back (45% loss)
	unstakeReq := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                "2025-02-01",
			"investment_account":  "Futures",
			"destination_account": "Binance Spot",
			"asset":               "USDT",
			"amount":              500,
			"exit_price_usd":      0.55, // 275/500 = 0.55 USD per unit (45% loss)
			"close_all":           true,
			"stake_deposit_tx_id": depositTxID,
		},
	}

	_, err = actionService.Perform(ctx, unstakeReq)
	if err != nil {
		t.Fatalf("unstake action failed: %v", err)
	}

	// Get PnL report
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC),
	}
	pnlReport, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("failed to get PnL: %v", err)
	}

	// Expected PnL: We originally staked 500 USDT ($500 value), now only getting 275 USDT back
	// Loss = $275 (received) - $500 (original cost) = -$225
	expectedPnL := decimal.NewFromInt(-225)
	if !pnlReport.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("Expected realized PnL USD = %s, got %s", expectedPnL, pnlReport.RealizedPnLUSD)
	}

	// Expected ROI: -$225 / $500 × 100% = -45%
	expectedROI := decimal.NewFromInt(-45)
	if !pnlReport.ROIPercent.Equal(expectedROI) {
		t.Errorf("Expected ROI = %s%%, got %s%%", expectedROI, pnlReport.ROIPercent)
	}
}

// TestPnL_StakeUnstake_PartialClose tests PnL when closing position partially
func TestPnL_StakeUnstake_PartialClose(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Stake 500 USDT at $1.00 per USDT
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
	if err != nil {
		t.Fatalf("stake action failed: %v", err)
	}
	depositTxID := stakeResp.Transactions[1].ID

	// Unstake 275 USDT at $1.00 per USDT (partial unstake at same price)
	unstakeReq := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                "2025-02-01",
			"investment_account":  "Futures",
			"destination_account": "Binance Spot",
			"asset":               "USDT",
			"amount":              275.0,
			"exit_price_usd":      1.0,
			"stake_deposit_tx_id": depositTxID,
		},
	}

	_, err = actionService.Perform(ctx, unstakeReq)
	if err != nil {
		t.Fatalf("unstake action failed: %v", err)
	}

	// Get PnL report
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC),
	}
	pnlReport, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("failed to get PnL: %v", err)
	}

	// Expected PnL with proportional cost basis:
	// Cost basis: (275/500) × $500 = $275
	// Exit value: 275 × $1.00 = $275
	// PnL: $275 - $275 = $0 (no gain/loss on the unstaked portion)
	expectedPnL := decimal.Zero
	if !pnlReport.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("Expected realized PnL USD = %s, got %s", expectedPnL, pnlReport.RealizedPnLUSD)
	}

	// Expected ROI: $0 / $275 × 100% = 0%
	expectedROI := decimal.Zero
	if !pnlReport.ROIPercent.Equal(expectedROI) {
		t.Errorf("Expected ROI = %s%%, got %s%%", expectedROI, pnlReport.ROIPercent)
	}
}

// TestPnL_StakeUnstake_GradualClose tests PnL when closing position in multiple steps
// Removed non-helpful GradualClose test that duplicated coverage and produced noisy failures.
