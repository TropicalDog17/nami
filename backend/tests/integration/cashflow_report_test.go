package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestReportingService_GetCashFlow_OperatingVsFinancing(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC)

	// Seed transactions:
	// Operating inflow: income 200
	// Operating outflow: expense 50
	// Financing inflow: borrow 500
	// Financing outflow: repay_borrow 100, interest_expense 10
	// Internal flow ignored
	transactions := []*models.Transaction{
		{
			Date:       start.AddDate(0, 0, 1),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   decimal.NewFromFloat(200),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:    func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
		},
		{
			Date:       start.AddDate(0, 0, 2),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Cash",
			Quantity:   decimal.NewFromFloat(50),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:    func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
		},
		{
			Date:           start.AddDate(0, 0, 3),
			Type:           "borrow",
			Asset:          "USD",
			Account:        "Bank",
			Quantity:       decimal.NewFromFloat(500),
			PriceLocal:     decimal.NewFromFloat(1),
			FXToUSD:        func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:        func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
			BorrowAPR:      decimalPtr(decimal.NewFromFloat(0.1)),
			BorrowTermDays: intPtr(30),
		},
		{
			Date:       start.AddDate(0, 0, 10),
			Type:       "repay_borrow",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   decimal.NewFromFloat(100),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:    func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
		},
		{
			Date:       start.AddDate(0, 0, 15),
			Type:       "interest_expense",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   decimal.NewFromFloat(10),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:    func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
		},
		{
			Date:         start.AddDate(0, 0, 20),
			Type:         "transfer_out",
			Asset:        "USD",
			Account:      "Bank",
			Quantity:     decimal.NewFromFloat(30),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      func() *decimal.Decimal { d := decimal.NewFromInt(1); return &d }(),
			FXToVND:      func() *decimal.Decimal { d := decimal.NewFromInt(25000); return &d }(),
			InternalFlow: boolPtr(true),
		},
	}

	for _, tx := range transactions {
		if err := txService.CreateTransaction(ctx, tx); err != nil {
			t.Fatalf("failed to create transaction: %v", err)
		}
	}

	period := models.Period{StartDate: start, EndDate: end}
	report, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow failed: %v", err)
	}

	// Totals
	// income 200 inflow, expense 50 outflow, borrow 500 inflow, repay 100 outflow, interest 10 outflow
	expectedTotalIn := decimal.NewFromInt(700)  // 200 + 500
	expectedTotalOut := decimal.NewFromInt(160) // 50 + 100 + 10
	expectedNet := expectedTotalIn.Sub(expectedTotalOut)
	if !report.TotalInUSD.Equal(expectedTotalIn) || !report.TotalOutUSD.Equal(expectedTotalOut) || !report.NetUSD.Equal(expectedNet) {
		t.Fatalf("unexpected totals: in=%s out=%s net=%s", report.TotalInUSD.String(), report.TotalOutUSD.String(), report.NetUSD.String())
	}

	// Operating vs Financing
	if !report.OperatingInUSD.Equal(decimal.NewFromInt(200)) {
		t.Fatalf("expected operating inflow 200, got %s", report.OperatingInUSD.String())
	}
	if !report.OperatingOutUSD.Equal(decimal.NewFromInt(50)) {
		t.Fatalf("expected operating outflow 50, got %s", report.OperatingOutUSD.String())
	}
	if !report.FinancingInUSD.Equal(decimal.NewFromInt(500)) {
		t.Fatalf("expected financing inflow 500, got %s", report.FinancingInUSD.String())
	}
	if !report.FinancingOutUSD.Equal(decimal.NewFromInt(110)) { // 100 + 10
		t.Fatalf("expected financing outflow 110, got %s", report.FinancingOutUSD.String())
	}

	// Combined
	if !report.CombinedInUSD.Equal(expectedTotalIn) || !report.CombinedOutUSD.Equal(expectedTotalOut) || !report.CombinedNetUSD.Equal(expectedNet) {
		t.Fatalf("unexpected combined totals: in=%s out=%s net=%s", report.CombinedInUSD.String(), report.CombinedOutUSD.String(), report.CombinedNetUSD.String())
	}

	// ByType basic checks
	if report.ByType["income"] == nil || !report.ByType["income"].InflowUSD.Equal(decimal.NewFromInt(200)) {
		t.Fatalf("expected income inflow 200, got %+v", report.ByType["income"])
	}
	if report.ByType["expense"] == nil || !report.ByType["expense"].OutflowUSD.Equal(decimal.NewFromInt(50)) {
		t.Fatalf("expected expense outflow 50, got %+v", report.ByType["expense"])
	}
	if report.ByType["borrow"] == nil || !report.ByType["borrow"].InflowUSD.Equal(decimal.NewFromInt(500)) {
		t.Fatalf("expected borrow inflow 500, got %+v", report.ByType["borrow"])
	}
	if report.ByType["repay_borrow"] == nil || !report.ByType["repay_borrow"].OutflowUSD.Equal(decimal.NewFromInt(100)) {
		t.Fatalf("expected repay_borrow outflow 100, got %+v", report.ByType["repay_borrow"])
	}
	if report.ByType["interest_expense"] == nil || !report.ByType["interest_expense"].OutflowUSD.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("expected interest_expense outflow 10, got %+v", report.ByType["interest_expense"])
	}
}

// helpers
func intPtr(v int) *int                             { return &v }
func decimalPtr(d decimal.Decimal) *decimal.Decimal { return &d }
