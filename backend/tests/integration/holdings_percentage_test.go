package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestReportingService_GetHoldings_WithPercentages(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	// Create some test transactions to generate holdings
	asOf := time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)

	// Add some holdings with different values
	transactions := []*models.Transaction{
		{
			Date:          asOf.AddDate(0, 0, -5),
			Type:          "buy",
			Asset:         "BTC",
			Account:       "Binance",
			Quantity:      decimal.NewFromFloat(0.1),
			PriceLocal:    decimal.NewFromFloat(50000),
			LocalCurrency: "USD",
		},
		{
			Date:          asOf.AddDate(0, 0, -3),
			Type:          "buy",
			Asset:         "ETH",
			Account:       "Binance",
			Quantity:      decimal.NewFromFloat(1.0),
			PriceLocal:    decimal.NewFromFloat(3000),
			LocalCurrency: "USD",
		},
		{
			Date:          asOf.AddDate(0, 0, -1),
			Type:          "buy",
			Asset:         "USDT",
			Account:       "Binance",
			Quantity:      decimal.NewFromFloat(2000),
			PriceLocal:    decimal.NewFromFloat(1),
			LocalCurrency: "USD",
			// CashFlow field calculated automatically
		},
	}

	// Create transactions
	for _, tx := range transactions {
		err := txService.CreateTransaction(ctx, tx)
		if err != nil {
			t.Fatalf("Failed to create test transaction: %v", err)
		}
	}

	// Get holdings
	holdings, err := reportingService.GetHoldings(ctx, asOf)
	if err != nil {
		t.Fatalf("Failed to get holdings: %v", err)
	}

	// Verify we have 3 holdings
	if len(holdings) != 3 {
		t.Fatalf("Expected 3 holdings, got %d", len(holdings))
	}

	// Calculate expected percentages
	expectedPercentages := map[string]decimal.Decimal{
		"BTC":  decimal.NewFromFloat(50), // 5000/10000 * 100
		"ETH":  decimal.NewFromFloat(30), // 3000/10000 * 100
		"USDT": decimal.NewFromFloat(20), // 2000/10000 * 100
	}

	// Verify percentages are calculated correctly
	for _, holding := range holdings {
		expectedPercentage, exists := expectedPercentages[holding.Asset]
		if !exists {
			t.Errorf("Unexpected asset in holdings: %s", holding.Asset)
			continue
		}

		if !holding.Percentage.Equal(expectedPercentage) {
			t.Errorf("Expected percentage for %s to be %s, got %s",
				holding.Asset, expectedPercentage.String(), holding.Percentage.String())
		}

		// Verify percentage is positive
		if holding.Percentage.LessThanOrEqual(decimal.Zero) {
			t.Errorf("Expected positive percentage for %s, got %s", holding.Asset, holding.Percentage.String())
		}
	}
}

func TestReportingService_GetHoldingsByAsset_WithPercentages(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	asOf := time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)

	// Add multiple transactions for the same asset to test aggregation
	transactions := []*models.Transaction{
		{
			Date:          asOf.AddDate(0, 0, -5),
			Type:          "buy",
			Asset:         "BTC",
			Account:       "Binance",
			Quantity:      decimal.NewFromFloat(0.1),
			PriceLocal:    decimal.NewFromFloat(50000),
			LocalCurrency: "USD",
			DeltaQty:      decimal.NewFromFloat(0.1),
			// CashFlow field calculated automatically
		},
		{
			Date:          asOf.AddDate(0, 0, -3),
			Type:          "buy",
			Asset:         "BTC",
			Account:       "Coinbase",
			Quantity:      decimal.NewFromFloat(0.05),
			PriceLocal:    decimal.NewFromFloat(50000),
			LocalCurrency: "USD",
			DeltaQty:      decimal.NewFromFloat(0.05),
			// CashFlow field calculated automatically
		},
		{
			Date:          asOf.AddDate(0, 0, -1),
			Type:          "buy",
			Asset:         "ETH",
			Account:       "Binance",
			Quantity:      decimal.NewFromFloat(1.0),
			PriceLocal:    decimal.NewFromFloat(3000),
			LocalCurrency: "USD",
			DeltaQty:      decimal.NewFromFloat(1.0),
			// CashFlow field calculated automatically
		},
	}

	// Create transactions
	for _, tx := range transactions {
		err := txService.CreateTransaction(ctx, tx)
		if err != nil {
			t.Fatalf("Failed to create test transaction: %v", err)
		}
	}

	// Get holdings by asset
	holdingsByAsset, err := reportingService.GetHoldingsByAsset(ctx, asOf)
	if err != nil {
		t.Fatalf("Failed to get holdings by asset: %v", err)
	}

	// Verify we have 2 assets (BTC and ETH)
	if len(holdingsByAsset) != 2 {
		t.Fatalf("Expected 2 assets, got %d", len(holdingsByAsset))
	}

	// Verify BTC holdings are aggregated correctly
	btcHolding := holdingsByAsset["BTC"]
	if !btcHolding.Quantity.Equal(decimal.NewFromFloat(0.15)) { // 0.1 + 0.05
		t.Errorf("Expected BTC quantity to be 0.15, got %s", btcHolding.Quantity.String())
	}
	if !btcHolding.ValueUSD.Equal(decimal.NewFromFloat(7500)) { // 5000 + 2500
		t.Errorf("Expected BTC value to be 7500, got %s", btcHolding.ValueUSD.String())
	}

	// Verify ETH holdings
	ethHolding := holdingsByAsset["ETH"]
	if !ethHolding.Quantity.Equal(decimal.NewFromFloat(1.0)) {
		t.Errorf("Expected ETH quantity to be 1.0, got %s", ethHolding.Quantity.String())
	}
	if !ethHolding.ValueUSD.Equal(decimal.NewFromFloat(3000)) {
		t.Errorf("Expected ETH value to be 3000, got %s", ethHolding.ValueUSD.String())
	}

	// Verify percentages are calculated correctly
	expectedBTCPercentage := decimal.NewFromFloat(71.42857142857142857142857143) // 7500/10500 * 100
	expectedETHPercentage := decimal.NewFromFloat(28.57142857142857142857142857) // 3000/10500 * 100

	// Use a tolerance for decimal comparison due to floating-point precision
	tolerance := decimal.NewFromFloat(0.00000001)

	btcPercentageDiff := btcHolding.Percentage.Sub(expectedBTCPercentage).Abs()
	if btcPercentageDiff.GreaterThan(tolerance) {
		t.Errorf("Expected BTC percentage to be approximately %s, got %s (diff: %s)",
			expectedBTCPercentage.String(), btcHolding.Percentage.String(), btcPercentageDiff.String())
	}

	ethPercentageDiff := ethHolding.Percentage.Sub(expectedETHPercentage).Abs()
	if ethPercentageDiff.GreaterThan(tolerance) {
		t.Errorf("Expected ETH percentage to be approximately %s, got %s (diff: %s)",
			expectedETHPercentage.String(), ethHolding.Percentage.String(), ethPercentageDiff.String())
	}

	// Verify percentages sum to 100% (with tolerance)
	totalPercentage := btcHolding.Percentage.Add(ethHolding.Percentage)
	sumDiff := totalPercentage.Sub(decimal.NewFromInt(100)).Abs()
	if sumDiff.GreaterThan(tolerance) {
		t.Errorf("Expected percentages to sum to 100, got %s (diff: %s)", totalPercentage.String(), sumDiff.String())
	}
}
