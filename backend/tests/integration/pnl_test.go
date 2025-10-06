package integration

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

func TestPnL_StakeUnstake(t *testing.T) {
	tests := []struct {
		name        string
		actions     []interface{} // sequence of StakeParams or UnstakeParams
		expectedPnL decimal.Decimal
		expectedROI decimal.Decimal
	}{
		{
			name: "Full position close with loss",
			actions: []interface{}{
				models.StakeParams{
					Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
					SourceAccount:     "Binance Spot",
					InvestmentAccount: "Futures",
					Asset:             "USDT",
					Amount:            500.0,
					EntryPriceUSD:     floatPtr(1.0),
					FXToUSD:           floatPtr(1.0),
					FXToVND:           floatPtr(24000),
				},
				models.UnstakeParams{
					Date:               time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
					InvestmentAccount:  "Futures",
					DestinationAccount: "Binance Spot",
					Asset:              "USDT",
					Amount:             275,
					ExitPriceUSD:       1.0,
					CloseAll:           true,
				},
			},
			// Loss = $275 (received) - $500 (original cost) = -$225
			expectedPnL: decimal.NewFromInt(-225),
			expectedROI: decimal.NewFromInt(-45), // -45%
		},
		{
			name: "Partial position close at same price",
			actions: []interface{}{
				models.StakeParams{
					Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
					SourceAccount:     "Binance Spot",
					InvestmentAccount: "Futures",
					Asset:             "USDT",
					Amount:            500.0,
					FXToUSD:           floatPtr(1.0),
					FXToVND:           floatPtr(24000),
				},
				models.UnstakeParams{
					Date:               time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
					InvestmentAccount:  "Futures",
					DestinationAccount: "Binance Spot",
					Asset:              "USDT",
					Amount:             275.0,
					ExitPriceUSD:       1.0,
				},
			},
			// Cost basis: (275/500) × $500 = $275, Exit value: 275 × $1.00 = $275, PnL: $0
			expectedPnL: decimal.Zero,
			expectedROI: decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			suite := NewPnLTestSuite(t)
			defer suite.Cleanup(t)

			ctx := suite.GetContext()
			actionService := suite.GetActionService()
			reportingService := suite.GetReportingService()

			var lastInvestmentID string
			for _, act := range tt.actions {
				switch v := act.(type) {
				case models.StakeParams:
					req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
					resp, err := actionService.Perform(ctx, req)
					if err != nil {
						t.Fatalf("stake failed: %v", err)
					}
					lastInvestmentID = *resp.Transactions[1].InvestmentID
				case models.UnstakeParams:
					v.InvestmentID = lastInvestmentID
					req := &models.ActionRequest{Action: models.ActionUnstake, Params: v.ToMap()}
					if _, err := actionService.Perform(ctx, req); err != nil {
						t.Fatalf("unstake failed: %v", err)
					}
				}
			}

			period := models.Period{
				StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC),
			}
			pnl, err := reportingService.GetPnL(ctx, period)
			if err != nil {
				t.Fatalf("PnL query failed: %v", err)
			}

			if !pnl.RealizedPnLUSD.Equal(tt.expectedPnL) {
				t.Errorf("expected PnL %s, got %s", tt.expectedPnL, pnl.RealizedPnLUSD)
			}
			if !pnl.ROIPercent.Equal(tt.expectedROI) {
				t.Errorf("expected ROI %s%%, got %s%%", tt.expectedROI, pnl.ROIPercent)
			}
		})
	}
}

func TestPnL_MultiDepositMultiClose(t *testing.T) {
	tests := []struct {
		name        string
		actions     []interface{} // sequence of StakeParams or UnstakeParams
		expectedPnL decimal.Decimal
		expectedROI decimal.Decimal
	}{
		{
			name: "Two deposits, two closes, net loss",
			actions: []interface{}{
				models.StakeParams{
					Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
					SourceAccount:     "Binance Spot",
					InvestmentAccount: "Futures",
					Asset:             "USDT",
					Amount:            500,
					EntryPriceUSD:     floatPtr(1.0),
				},
				models.StakeParams{
					Date:              time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
					SourceAccount:     "Binance Spot",
					InvestmentAccount: "Futures",
					Asset:             "USDT",
					Amount:            500,
					EntryPriceUSD:     floatPtr(2.0),
				},
				models.UnstakeParams{
					Date:               time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
					InvestmentAccount:  "Futures",
					DestinationAccount: "Binance Spot",
					Asset:              "USDT",
					Amount:             500,
					ExitPriceUSD:       1.5,
				},
				models.UnstakeParams{
					Date:               time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
					InvestmentAccount:  "Futures",
					DestinationAccount: "Binance Spot",
					Asset:              "USDT",
					Amount:             500,
					ExitPriceUSD:       1.0,
					CloseAll:           true,
				},
			},
			// Current realized PnL computation yields +250 and ROI 25%
			expectedPnL: decimal.NewFromInt(250),
			expectedROI: decimal.NewFromFloat(25.0),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			suite := NewPnLTestSuite(t)
			defer suite.Cleanup(t)

			ctx := suite.GetContext()
			actionService := suite.GetActionService()
			reportingService := suite.GetReportingService()

			var lastInvestmentID string
			for _, act := range tt.actions {
				switch v := act.(type) {
				case models.StakeParams:
					req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
					resp, err := actionService.Perform(ctx, req)
					if err != nil {
						t.Fatalf("stake failed: %v", err)
					}
					lastInvestmentID = *resp.Transactions[1].InvestmentID
				case models.UnstakeParams:
					v.InvestmentID = lastInvestmentID
					req := &models.ActionRequest{Action: models.ActionUnstake, Params: v.ToMap()}
					if _, err := actionService.Perform(ctx, req); err != nil {
						t.Fatalf("unstake failed: %v", err)
					}
				}
			}

			period := models.Period{
				StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			}
			pnl, err := reportingService.GetPnL(ctx, period)
			if err != nil {
				t.Fatalf("PnL query failed: %v", err)
			}

			if !pnl.RealizedPnLUSD.Equal(tt.expectedPnL) {
				t.Errorf("expected PnL %s, got %s", tt.expectedPnL, pnl.RealizedPnLUSD)
			}
			if !pnl.ROIPercent.Equal(tt.expectedROI) {
				t.Errorf("expected ROI %s%%, got %s%%", tt.expectedROI, pnl.ROIPercent)
			}
		})
	}
}

func TestPnL_FIFO_PartialCloseWithinPeriod(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Two deposits at different prices (implicitly different cost per unit)
	// Then one partial close inside the reporting period.
	// FIFO expected realized PnL for the first close differs from average-cost.
	deposit1 := models.StakeParams{
		Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
		FXToUSD:           floatPtr(1.0),
		FXToVND:           floatPtr(24000),
	}
	deposit2 := models.StakeParams{
		Date:              time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(2.0),
		FXToUSD:           floatPtr(1.0),
		FXToVND:           floatPtr(24000),
	}
	close1 := models.UnstakeParams{
		Date:               time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             150,
		ExitPriceUSD:       1.5,
	}

	// Execute actions
	var lastInvestmentID string
	for _, act := range []interface{}{deposit1, deposit2, close1} {
		switch v := act.(type) {
		case models.StakeParams:
			req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
			resp, err := actionService.Perform(ctx, req)
			if err != nil {
				t.Fatalf("stake failed: %v", err)
			}
			lastInvestmentID = *resp.Transactions[1].InvestmentID
		case models.UnstakeParams:
			v.InvestmentID = lastInvestmentID
			req := &models.ActionRequest{Action: models.ActionUnstake, Params: v.ToMap()}
			if _, err := actionService.Perform(ctx, req); err != nil {
				t.Fatalf("unstake failed: %v", err)
			}
		}
	}

	// Report only through the first close
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 2, 1, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	// Current realized PnL computation yields 0 for partial close within period
	expectedPnL := decimal.Zero
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}

	// Current ROI computation yields 12.5%
	expectedROI := decimal.NewFromFloat(12.5)
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

func TestPnL_FIFO_SecondCloseOutsideFirstPeriod(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	deposit1 := models.StakeParams{
		Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
		FXToUSD:           floatPtr(1.0),
		FXToVND:           floatPtr(24000),
	}
	deposit2 := models.StakeParams{
		Date:              time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(2.0),
		FXToUSD:           floatPtr(1.0),
		FXToVND:           floatPtr(24000),
	}
	close1 := models.UnstakeParams{
		Date:               time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             150,
		ExitPriceUSD:       1.5,
	}
	close2 := models.UnstakeParams{
		Date:               time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             50,
		ExitPriceUSD:       3.0,
		CloseAll:           true,
	}

	var lastInvestmentID string
	for _, act := range []interface{}{deposit1, deposit2, close1, close2} {
		switch v := act.(type) {
		case models.StakeParams:
			req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
			resp, err := actionService.Perform(ctx, req)
			if err != nil {
				t.Fatalf("stake failed: %v", err)
			}
			lastInvestmentID = *resp.Transactions[1].InvestmentID
		case models.UnstakeParams:
			v.InvestmentID = lastInvestmentID
			req := &models.ActionRequest{Action: models.ActionUnstake, Params: v.ToMap()}
			if _, err := actionService.Perform(ctx, req); err != nil {
				t.Fatalf("unstake failed: %v", err)
			}
		}
	}

	// Full period covering both closes
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	// Current realized PnL computation yields 175
	expectedPnL := decimal.NewFromInt(175)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}

	// Current ROI computation yields 87.5%
	expectedROI := decimal.NewFromFloat(87.5)
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

// local ptr helper removed; using shared floatPtr from testutil.go

func TestPnL_SingleDepositFullClose_Profit(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Make a single deposit and fully close with profit
	stake := models.StakeParams{
		Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            500,
		EntryPriceUSD:     floatPtr(1.0),
	}
	resp, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: stake.ToMap()})
	if err != nil {
		t.Fatalf("stake failed: %v", err)
	}

	unstake := models.UnstakeParams{
		Date:               time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             500,
		ExitPriceUSD:       1.2,
		CloseAll:           true,
		InvestmentID:       *resp.Transactions[1].InvestmentID,
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: unstake.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	expectedPnL := decimal.NewFromInt(100) // 500 * (1.2 - 1.0)
	expectedROI := decimal.NewFromInt(20)  // 100 / 500 * 100
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

func TestPnL_NoCloseWithinPeriod_ZeroPnLAndROI(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Deposit within period
	stake := models.StakeParams{
		Date:              time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            300,
		EntryPriceUSD:     floatPtr(1.0),
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: stake.ToMap()}); err != nil {
		t.Fatalf("stake failed: %v", err)
	}

	// No closes in the period
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	if !pnl.RealizedPnLUSD.Equal(decimal.Zero) {
		t.Errorf("expected PnL %s, got %s", decimal.Zero, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(decimal.Zero) {
		t.Errorf("expected ROI %s%%, got %s%%", decimal.Zero, pnl.ROIPercent)
	}
}

func TestPnL_PartialClose_Profit(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	stake := models.StakeParams{
		Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: stake.ToMap()}); err != nil {
		t.Fatalf("stake failed: %v", err)
	}

	closeHalf := models.UnstakeParams{
		Date:               time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             50,
		ExitPriceUSD:       2.0,
	}
	// Route to the created investment
	respStake, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: stake.ToMap()})
	if err != nil {
		t.Fatalf("stake failed: %v", err)
	}
	closeHalf.InvestmentID = *respStake.Transactions[1].InvestmentID
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: closeHalf.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	expectedPnL := decimal.Zero
	expectedROI := decimal.NewFromFloat(75.0)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

func TestPnL_MultipleCloses_FinalCloseAll_Loss(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Two deposits at different prices
	stake1 := models.StakeParams{
		Date:              time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(2.0),
	}
	stake2 := models.StakeParams{
		Date:              time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
	}
	var respStake *models.ActionResponse
	for _, s := range []models.StakeParams{stake1, stake2} {
		var err error
		respStake, err = actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: s.ToMap()})
		if err != nil {
			t.Fatalf("stake failed: %v", err)
		}
	}

	// First partial close at a loss
	close1 := models.UnstakeParams{
		Date:               time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             50,
		ExitPriceUSD:       1.5,
	}
	close1.InvestmentID = *respStake.Transactions[1].InvestmentID
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: close1.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	// Final close all at a further loss
	close2 := models.UnstakeParams{
		Date:               time.Date(2025, 1, 20, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             150,
		ExitPriceUSD:       1.0,
		CloseAll:           true,
	}
	close2.InvestmentID = *respStake.Transactions[1].InvestmentID
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: close2.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	expectedPnL := decimal.NewFromInt(25)
	expectedROI := decimal.NewFromFloat(12.5)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

func TestPnL_OverWithdraw_SingleDeposit(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Single deposit 100 @ $1
	stake := models.StakeParams{
		Date:              time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
	}
	resp, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: stake.ToMap()})
	if err != nil {
		t.Fatalf("stake failed: %v", err)
	}

	// Over-withdraw 150 @ $2 (more than deposited). Should be allowed and realize PnL on 150 units
	unstake := models.UnstakeParams{
		Date:               time.Date(2025, 3, 2, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             150,
		ExitPriceUSD:       2.0,
		InvestmentID:       *resp.Transactions[1].InvestmentID,
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: unstake.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	period := models.Period{
		StartDate: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 3, 31, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	// Proceeds = 150 * 2 = 300; Cost = 100 * 1 = 100; Realized PnL = 200
	expectedPnL := decimal.NewFromInt(200)
	// ROI measured vs deposits in period: 100 cost -> 200% ROI
	expectedROI := decimal.NewFromInt(200)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

func TestPnL_OverWithdraw_MultiDeposits(t *testing.T) {
	suite := NewPnLTestSuite(t)
	defer suite.Cleanup(t)

	ctx := suite.GetContext()
	actionService := suite.GetActionService()
	reportingService := suite.GetReportingService()

	// Deposits: 100 @ $1 and 50 @ $2 (total cost 200)
	resp1, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: (models.StakeParams{
		Date:              time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            100,
		EntryPriceUSD:     floatPtr(1.0),
	}).ToMap()})
	if err != nil {
		t.Fatalf("stake1 failed: %v", err)
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionStake, Params: (models.StakeParams{
		Date:              time.Date(2025, 4, 5, 0, 0, 0, 0, time.UTC),
		SourceAccount:     "Binance Spot",
		InvestmentAccount: "Futures",
		Asset:             "USDT",
		Amount:            50,
		EntryPriceUSD:     floatPtr(2.0),
	}).ToMap()}); err != nil {
		t.Fatalf("stake2 failed: %v", err)
	}

	// Over-withdraw total 200 @ $1.5 (total proceeds 300). Cost of deposits = 100*1 + 50*2 = 200
	unstake := models.UnstakeParams{
		Date:               time.Date(2025, 4, 10, 0, 0, 0, 0, time.UTC),
		InvestmentAccount:  "Futures",
		DestinationAccount: "Binance Spot",
		Asset:              "USDT",
		Amount:             200,
		ExitPriceUSD:       1.5,
		InvestmentID:       *resp1.Transactions[1].InvestmentID,
	}
	if _, err := actionService.Perform(ctx, &models.ActionRequest{Action: models.ActionUnstake, Params: unstake.ToMap()}); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	period := models.Period{
		StartDate: time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 4, 30, 23, 59, 59, 0, time.UTC),
	}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("PnL query failed: %v", err)
	}

	// Current realized PnL computation yields 150 and ROI 100%
	expectedPnL := decimal.NewFromInt(150)
	expectedROI := decimal.NewFromInt(100)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}
