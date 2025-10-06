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
			// Cost = $1500, proceeds = (500*1.5 + 500*1.0) = $1250, PnL = -250
			expectedPnL: decimal.NewFromInt(-250),
			expectedROI: decimal.NewFromFloat(-16.66666666666667), // -250/1500 *100 ≈ -16.7%
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			suite := NewPnLTestSuite(t)
			defer suite.Cleanup(t)

			ctx := suite.GetContext()
			actionService := suite.GetActionService()
			reportingService := suite.GetReportingService()

			for _, act := range tt.actions {
				switch v := act.(type) {
				case models.StakeParams:
					req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
					_, err := actionService.Perform(ctx, req)
					if err != nil {
						t.Fatalf("stake failed: %v", err)
					}
				case models.UnstakeParams:
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
	for _, act := range []interface{}{deposit1, deposit2, close1} {
		switch v := act.(type) {
		case models.StakeParams:
			req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
			if _, err := actionService.Perform(ctx, req); err != nil {
				t.Fatalf("stake failed: %v", err)
			}
		case models.UnstakeParams:
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

	// FIFO realized PnL for first close of 150 @ 1.5: proceeds 225,
	// cost = 100*1.0 + 50*2.0 = 200 => PnL = +25
	expectedPnL := decimal.NewFromInt(25)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}

	// ROI over deposits within the period (total deposits = 100*1 + 100*2 = 300)
	expectedROI := decimal.NewFromFloat(25.0 / 300.0 * 100.0)
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

	for _, act := range []interface{}{deposit1, deposit2, close1, close2} {
		var resp *models.ActionResponse
		var err error
		switch v := act.(type) {
		case models.StakeParams:
			req := &models.ActionRequest{Action: models.ActionStake, Params: v.ToMap()}
			if resp, err = actionService.Perform(ctx, req); err != nil {
				t.Fatalf("stake failed: %v", err)
			}
		case models.UnstakeParams:
			v.InvestmentID = *resp.Transactions[1].InvestmentID
			req := &models.ActionRequest{Action: models.ActionUnstake, Params: v.ToMap()}
			if _, err = actionService.Perform(ctx, req); err != nil {
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

	// Combined realized PnL: first close +25, second close +50 = +75
	expectedPnL := decimal.NewFromInt(75)
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Errorf("expected PnL %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}

	// ROI vs total deposits (300)
	expectedROI := decimal.NewFromFloat(75.0 / 300.0 * 100.0)
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Errorf("expected ROI %s%%, got %s%%", expectedROI, pnl.ROIPercent)
	}
}

// local ptr helper removed; using shared floatPtr from testutil.go
