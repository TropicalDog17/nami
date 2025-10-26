package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// mock implementation of AssetPriceService for init_balance crypto test
type mockInitPriceService struct{ price decimal.Decimal }

func (m *mockInitPriceService) GetDaily(_ context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
	return &models.AssetPrice{Symbol: symbol, Currency: currency, Price: m.price, Date: date}, nil
}

func (m *mockInitPriceService) GetRange(_ context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error) {
	res := make([]*models.AssetPrice, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		res = append(res, &models.AssetPrice{Symbol: symbol, Currency: currency, Price: m.price, Date: d})
	}
	return res, nil
}

// Ensures that init_balance for crypto fetches price at the time when not provided
func TestInitBalance_Crypto_UsesDailyPrice(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)

	// Provide an asset price service to the action service via mock
	priceSvc := &mockInitPriceService{price: decimal.NewFromFloat(42000.0)}
	actionService := services.NewActionServiceWithPrices(tdb.database, txService, priceSvc)

	d := time.Date(2025, 2, 2, 0, 0, 0, 0, time.UTC)

	// Call init_balance without price_local to trigger price fetch for BTC in USD
	req := &models.ActionRequest{
		Action: models.ActionInitBalance,
		Params: map[string]interface{}{
			"date":     d.Format("2006-01-02"),
			"account":  "Binance Spot",
			"asset":    "BTC",
			"quantity": "0.5",
			"fx_to_usd": 1.0,
			"fx_to_vnd": 25000.0,
			// price_local omitted intentionally
		},
	}

	resp, err := actionService.Perform(ctx, req)
	if err != nil {
		t.Fatalf("init_balance failed: %v", err)
	}
	if len(resp.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(resp.Transactions))
	}
	tx := resp.Transactions[0]
	// Expect price_local fetched as 42000 USD, fx_to_usd defaulted to 1
	if !tx.PriceLocal.Equal(decimal.NewFromFloat(42000)) {
		t.Fatalf("expected price_local 42000, got %s", tx.PriceLocal)
	}
	if !tx.FXToUSD.Equal(decimal.NewFromInt(1)) {
		t.Fatalf("expected fx_to_usd 1, got %s", tx.FXToUSD)
	}
	// AmountUSD = 0.5 * 42000 = 21000
	if !tx.AmountUSD.Equal(decimal.NewFromInt(21000)) {
		t.Fatalf("expected amount_usd 21000, got %s", tx.AmountUSD)
	}
}
