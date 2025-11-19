package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestSaving_InterestIncome(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 5, 31, 0, 0, 0, 0, time.UTC)

	// Create an interest income transaction (e.g. from a savings account)
	interestTx := &models.Transaction{
		Date:       start.AddDate(0, 0, 15),
		Type:       "interest",
		Asset:      "USD",
		Account:    "Savings Account",
		Quantity:   decimal.NewFromFloat(50),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromInt(1),
		FXToVND:    decimal.NewFromInt(25000),
	}

	if err := txService.CreateTransaction(ctx, interestTx); err != nil {
		t.Fatalf("failed to create interest transaction: %v", err)
	}

	// Verify it appears in cashflow report
	period := models.Period{StartDate: start, EndDate: end}
	report, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow failed: %v", err)
	}

	// Should be counted as inflow
	if !report.TotalInUSD.Equal(decimal.NewFromFloat(50)) {
		t.Fatalf("expected total inflow 50, got %s", report.TotalInUSD.String())
	}

	// Should be in ByType breakdown
	if report.ByType["interest"] == nil {
		t.Fatalf("expected 'interest' in ByType breakdown")
	}
	if !report.ByType["interest"].InflowUSD.Equal(decimal.NewFromFloat(50)) {
		t.Fatalf("expected interest inflow 50, got %s", report.ByType["interest"].InflowUSD.String())
	}
}
