package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// mockAssetPriceService implements AssetPriceService for tests
type mockAssetPriceService struct{ price decimal.Decimal }

func (m *mockAssetPriceService) GetDaily(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
	return &models.AssetPrice{Symbol: symbol, Currency: currency, Price: m.price, Date: date}, nil
}

func (m *mockAssetPriceService) GetRange(ctx context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error) {
	res := make([]*models.AssetPrice, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		res = append(res, &models.AssetPrice{Symbol: symbol, Currency: currency, Price: m.price, Date: d})
	}
	return res, nil
}

// Test that providing only amount (quantity) on unstake fetches USD price from AssetPriceService
func TestUnstake_AmountOnly_UsesFetchedPriceAndPnL(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	linkService := services.NewLinkService(tdb.database)
	investmentRepo := repositories.NewInvestmentRepository(tdb.database)
	investmentService := services.NewInvestmentService(investmentRepo, txService)
	priceSvc := &mockAssetPriceService{price: decimal.NewFromFloat(1.23)}
	actionService := services.NewActionServiceWithInvestments(tdb.database, txService, linkService, priceSvc, investmentService)
	reportingService := services.NewReportingService(tdb.database)

	// Stake 500 USDT
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
	// Also capture the investment ID created by the stake to use for unstake routing
	investmentID := *stakeResp.Transactions[1].InvestmentID

	// Unstake 275 with only amount (no exit price or exit amount) -> should fetch price 1.23
	unstakeReq := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                "2025-02-01",
			"investment_account":  "Futures",
			"destination_account": "Binance Earn",
			"asset":               "USDT",
			"amount":              275.0,
			"stake_deposit_tx_id": depositTxID,
			"investment_id":       investmentID,
		},
	}
	unstakeResp, err := actionService.Perform(ctx, unstakeReq)
	if err != nil {
		t.Fatalf("unstake action failed: %v", err)
	}
	withdraw := unstakeResp.Transactions[0]

	// Verify price was fetched and applied
	expectedPrice := decimal.NewFromFloat(1.23)
	if !withdraw.PriceLocal.Equal(expectedPrice) {
		t.Fatalf("expected withdraw price_local %s, got %s", expectedPrice, withdraw.PriceLocal)
	}
	// AmountUSD = qty * price * fx(=1)
	expectedAmount := decimal.NewFromInt(275).Mul(expectedPrice)
	if !withdraw.AmountUSD.Equal(expectedAmount) {
		t.Fatalf("expected withdraw amount_usd %s, got %s", expectedAmount, withdraw.AmountUSD)
	}

	// PnL for partial withdrawals remains unrealized; report includes realized-only totals
	period := models.Period{StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC)}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("GetPnL failed: %v", err)
	}
	// Expect realized PnL and ROI to be zero while position remains open
	if !pnl.RealizedPnLUSD.Equal(decimal.Zero) {
		t.Fatalf("expected realized pnl 0, got %s", pnl.RealizedPnLUSD)
	}
	if !pnl.ROIPercent.Equal(decimal.Zero) {
		t.Fatalf("expected ROI 0, got %s", pnl.ROIPercent)
	}
}

// Test close_all with exit_amount_usd derives price and closes the full remaining
func TestUnstake_CloseAll_ExitAmountUSD_PriceDerivedAndPnL(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	linkService := services.NewLinkService(tdb.database)
	investmentRepo := repositories.NewInvestmentRepository(tdb.database)
	investmentService := services.NewInvestmentService(investmentRepo, txService)
	// priceSvc not needed since exit_amount_usd is provided
	actionService := services.NewActionServiceWithInvestments(tdb.database, txService, linkService, nil, investmentService)
	reportingService := services.NewReportingService(tdb.database)

	// Stake 500 USDT
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
	// Capture investment ID for explicit unstake routing
	investmentID := *stakeResp.Transactions[1].InvestmentID

	// Close all with total exit USD 275 (derive price = 275/500 = 0.55)
	// Since close_all=true, it will mark the original stake as closed but unstake only 275
	unstakeReq := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                "2025-02-01",
			"investment_account":  "Futures",
			"destination_account": "Binance Earn",
			"asset":               "USDT",
			"amount":              275.0, // Actual amount to unstake
			"close_all":           true,  // Just mark original as closed
			"exit_amount_usd":     "275",
			"stake_deposit_tx_id": depositTxID,
			"investment_id":       investmentID,
		},
	}
	unstakeResp, err := actionService.Perform(ctx, unstakeReq)
	if err != nil {
		t.Fatalf("unstake action failed: %v", err)
	}
	withdraw := unstakeResp.Transactions[0]

	// Expect quantity 275 and derived unit price 1.0 (275/275 = 1.0)
	if !withdraw.Quantity.Equal(decimal.NewFromInt(275)) {
		t.Fatalf("expected withdraw quantity 275, got %s", withdraw.Quantity)
	}
	expectedUnit := decimal.NewFromFloat(1.0)
	if !withdraw.PriceLocal.Equal(expectedUnit) {
		t.Fatalf("expected withdraw price_local %s, got %s", expectedUnit, withdraw.PriceLocal)
	}
	// PnL should be 275 - 275 = 0 (since exit_amount_usd 275 matches unstake amount 275)
	period := models.Period{StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC)}
	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("GetPnL failed: %v", err)
	}
	expectedPnL := decimal.Zero
	if !pnl.RealizedPnLUSD.Equal(expectedPnL) {
		t.Fatalf("expected realized pnl %s, got %s", expectedPnL, pnl.RealizedPnLUSD)
	}
	// ROI = 0/275 * 100 = 0
	expectedROI := decimal.Zero
	if !pnl.ROIPercent.Equal(expectedROI) {
		t.Fatalf("expected ROI %s, got %s", expectedROI, pnl.ROIPercent)
	}
}
