package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestReportingService_GetSpending_WithBreakdowns(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	// Seed transactions: 3 expenses (two with tags/counterparties), 1 income, 1 internal transfer, 1 credit card expense (cashflow=0)
	transactions := []*models.Transaction{
		{
			Date:         start.AddDate(0, 0, 1),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Cash",
			Counterparty: stringPtr("StoreA"),
			Tag:          stringPtr("Food"),
			Quantity:     decimal.NewFromFloat(1),
			PriceLocal:   decimal.NewFromFloat(20),
			FXToUSD:      decimal.NewFromInt(1),
			FXToVND:      decimal.NewFromInt(25000),
			FeeUSD:       decimal.Zero,
			FeeVND:       decimal.Zero,
		},
		{
			Date:         start.AddDate(0, 0, 2),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Bank",
			Counterparty: stringPtr("StoreB"),
			Tag:          stringPtr("Transport"),
			Quantity:     decimal.NewFromFloat(1),
			PriceLocal:   decimal.NewFromFloat(15),
			FXToUSD:      decimal.NewFromInt(1),
			FXToVND:      decimal.NewFromInt(25000),
			FeeUSD:       decimal.Zero,
			FeeVND:       decimal.Zero,
		},
		{
			Date:         start.AddDate(0, 0, 3),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Cash",
			Counterparty: stringPtr("StoreA"),
			Tag:          stringPtr("Food"),
			Quantity:     decimal.NewFromFloat(1),
			PriceLocal:   decimal.NewFromFloat(5),
			FXToUSD:      decimal.NewFromInt(1),
			FXToVND:      decimal.NewFromInt(25000),
			FeeUSD:       decimal.Zero,
			FeeVND:       decimal.Zero,
		},
		{
			// Income should be ignored in spending totals
			Date:       start.AddDate(0, 0, 4),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   decimal.NewFromFloat(1),
			PriceLocal: decimal.NewFromFloat(100),
			FXToUSD:    decimal.NewFromInt(1),
			FXToVND:    decimal.NewFromInt(25000),
			FeeUSD:     decimal.Zero,
			FeeVND:     decimal.Zero,
		},
		{
			// Internal transfer should be excluded from cashflow per model logic and query filter
			Date:         start.AddDate(0, 0, 5),
			Type:         "transfer_out",
			Asset:        "USD",
			Account:      "Bank",
			Quantity:     decimal.NewFromFloat(50),
			PriceLocal:   decimal.NewFromInt(1),
			FXToUSD:      decimal.NewFromInt(1),
			FXToVND:      decimal.NewFromInt(25000),
			FeeUSD:       decimal.Zero,
			FeeVND:       decimal.Zero,
			InternalFlow: boolPtr(true),
		},
		{
			// Credit card expense: cashflow is zero; should not count as spending
			Date:         start.AddDate(0, 0, 6),
			Type:         "expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Counterparty: stringPtr("StoreC"),
			Tag:          stringPtr("Shopping"),
			Quantity:     decimal.NewFromFloat(1),
			PriceLocal:   decimal.NewFromFloat(30),
			FXToUSD:      decimal.NewFromInt(1),
			FXToVND:      decimal.NewFromInt(25000),
			FeeUSD:       decimal.Zero,
			FeeVND:       decimal.Zero,
		},
	}

	for _, tx := range transactions {
		if err := txService.CreateTransaction(ctx, tx); err != nil {
			t.Fatalf("failed to create transaction: %v", err)
		}
	}

	period := models.Period{StartDate: start, EndDate: end}
	report, err := reportingService.GetSpending(ctx, period)
	if err != nil {
		t.Fatalf("GetSpending failed: %v", err)
	}

	// Expected totals: expenses 20 + 15 + 5 = 40 USD; credit card expense ignored due to zero cashflow
	expectedTotal := decimal.NewFromInt(40)
	if !report.TotalUSD.Equal(expectedTotal) {
		t.Fatalf("expected total spending USD %s, got %s", expectedTotal.String(), report.TotalUSD.String())
	}

	// ByTag checks
	if report.ByTag["Food"] == nil || !report.ByTag["Food"].AmountUSD.Equal(decimal.NewFromInt(25)) {
		t.Fatalf("expected Food tag amount 25, got %+v", report.ByTag["Food"])
	}
	if report.ByTag["Transport"] == nil || !report.ByTag["Transport"].AmountUSD.Equal(decimal.NewFromInt(15)) {
		t.Fatalf("expected Transport tag amount 15, got %+v", report.ByTag["Transport"])
	}
	// Percentages: Food 25/40=62.5%, Transport 15/40=37.5%
	if report.ByTag["Food"].Percentage.String() != decimal.NewFromFloat(62.5).String() {
		t.Fatalf("expected Food percentage 62.5, got %s", report.ByTag["Food"].Percentage.String())
	}
	if report.ByTag["Transport"].Percentage.String() != decimal.NewFromFloat(37.5).String() {
		t.Fatalf("expected Transport percentage 37.5, got %s", report.ByTag["Transport"].Percentage.String())
	}

	// ByCounterparty checks
	if report.ByCounterparty["StoreA"] == nil || !report.ByCounterparty["StoreA"].AmountUSD.Equal(decimal.NewFromInt(25)) {
		t.Fatalf("expected StoreA amount 25, got %+v", report.ByCounterparty["StoreA"])
	}
	if report.ByCounterparty["StoreB"] == nil || !report.ByCounterparty["StoreB"].AmountUSD.Equal(decimal.NewFromInt(15)) {
		t.Fatalf("expected StoreB amount 15, got %+v", report.ByCounterparty["StoreB"])
	}

	// Top expenses should list the two largest first: 20 then 15 then 5
	if len(report.TopExpenses) < 3 {
		t.Fatalf("expected at least 3 top expenses, got %d", len(report.TopExpenses))
	}
	if !report.TopExpenses[0].AmountUSD.Equal(decimal.NewFromInt(20)) || !report.TopExpenses[1].AmountUSD.Equal(decimal.NewFromInt(15)) {
		t.Fatalf("unexpected top expenses order: got %s, %s", report.TopExpenses[0].AmountUSD.String(), report.TopExpenses[1].AmountUSD.String())
	}
}
