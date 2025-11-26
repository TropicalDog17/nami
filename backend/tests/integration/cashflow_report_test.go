package integration

import (
	"context"
	"testing"
	"time"

	"database/sql"

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
		},
		{
			Date:       start.AddDate(0, 0, 2),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Cash",
			Quantity:   decimal.NewFromFloat(50),
			PriceLocal: decimal.NewFromFloat(1),
		},
		{
			Date:           start.AddDate(0, 0, 3),
			Type:           "borrow",
			Asset:          "USD",
			Account:        "Bank",
			Quantity:       decimal.NewFromFloat(500),
			PriceLocal:     decimal.NewFromFloat(1),
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
		},
		{
			Date:       start.AddDate(0, 0, 15),
			Type:       "interest_expense",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   decimal.NewFromFloat(10),
			PriceLocal: decimal.NewFromFloat(1),
		},
		{
			Date:         start.AddDate(0, 0, 20),
			Type:         "transfer_out",
			Asset:        "USD",
			Account:      "Bank",
			Quantity:     decimal.NewFromFloat(30),
			PriceLocal:   decimal.NewFromFloat(1),
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

// getSQLDB is a small helper to access the underlying *sql.DB in tests without leaking db internals everywhere.
func getSQLDB(t *testing.T, tdb *testDB) *sql.DB {
	t.Helper()
	sqlDB, err := tdb.database.GetSQLDB()
	if err != nil {
		t.Fatalf("failed to get sql.DB: %v", err)
	}
	return sqlDB
}

// TestReportingService_GetCashFlow_PeriodEndFXContract makes the FX behaviour of GetCashFlow explicit:
// - All cashflows are stored in local currency (cashflow_local, local_currency)
// - For reporting in USD/VND we always convert using the latest USD↔VND FX rate with date <= EndDate
// - This is intentionally period-end FX, not per-transaction execution FX.
func TestReportingService_GetCashFlow_PeriodEndFXContract(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 2, 28, 0, 0, 0, 0, time.UTC)

	// Seed FX: earlier 23,000 then later 25,000 before EndDate.
	// GetCashFlow should always pick the latest rate <= EndDate, i.e. 25,000 here.
	sqlDB := getSQLDB(t, tdb)
	if _, err := sqlDB.ExecContext(ctx,
		`INSERT INTO fx_rates (from_currency, to_currency, rate, date, source)
         VALUES ('USD', 'VND', 23000, $1, 'test')`, start); err != nil {
		t.Fatalf("failed to insert fx_rate (23000): %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx,
		`INSERT INTO fx_rates (from_currency, to_currency, rate, date, source)
         VALUES ('USD', 'VND', 25000, $1, 'test')`, start.AddDate(0, 0, 10)); err != nil {
		t.Fatalf("failed to insert fx_rate (25000): %v", err)
	}

	// Transactions:
	// - USD income +100
	// - USD expense -40
	// - VND income +2,300,000
	// - VND expense -300,000
	//
	// With period-end FX rate = 25,000 VND per USD:
	//   VND cashflows in USD  = cashflow_local * (1 / 25,000)
	//   USD cashflows in VND  = cashflow_local * 25,000
	//
	// So expected totals:
	//   total_in_usd  = 100 + (2,300,000 / 25,000)   = 100 + 92  = 192
	//   total_out_usd = 40  + (300,000  / 25,000)   = 40  + 12  = 52
	//   net_usd       = 192 - 52                    = 140
	//
	//   total_in_vnd  = (100 * 25,000) + 2,300,000  = 2,500,000 + 2,300,000 = 4,800,000
	//   total_out_vnd = (40  * 25,000) + 300,000    = 1,000,000 +   300,000 = 1,300,000
	//   net_vnd       = 4,800,000 - 1,300,000       = 3,500,000

	periodEndRate := decimal.NewFromInt(25000)
	usdIncome := decimal.NewFromInt(100)
	usdExpense := decimal.NewFromInt(40)
	vndIncomeLocal := decimal.NewFromInt(2300000)
	vndExpenseLocal := decimal.NewFromInt(300000) // magnitude only; sign handled by type

	transactions := []*models.Transaction{
		{
			Date:       start.AddDate(0, 0, 1),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   usdIncome,
			PriceLocal: decimal.NewFromInt(1),
			// LocalCurrency inferred as USD by service.
		},
		{
			Date:       start.AddDate(0, 0, 2),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Bank",
			Quantity:   usdExpense,
			PriceLocal: decimal.NewFromInt(1),
		},
		{
			Date:          start.AddDate(0, 0, 3),
			Type:          "income",
			Asset:         "VND",
			Account:       "Wallet",
			Quantity:      decimal.NewFromInt(100),
			PriceLocal:    decimal.NewFromInt(23000),
			LocalCurrency: "VND",
		},
		{
			Date:          start.AddDate(0, 0, 4),
			Type:          "expense",
			Asset:         "VND",
			Account:       "Wallet",
			Quantity:      decimal.NewFromInt(300000),
			PriceLocal:    decimal.NewFromInt(1),
			LocalCurrency: "VND",
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

	expectedTotalInUSD := usdIncome.Add(vndIncomeLocal.Div(periodEndRate))
	expectedTotalOutUSD := usdExpense.Add(vndExpenseLocal.Div(periodEndRate))
	expectedNetUSD := expectedTotalInUSD.Sub(expectedTotalOutUSD)

	expectedTotalInVND := usdIncome.Mul(periodEndRate).Add(vndIncomeLocal)
	expectedTotalOutVND := usdExpense.Mul(periodEndRate).Add(vndExpenseLocal)
	expectedNetVND := expectedTotalInVND.Sub(expectedTotalOutVND)

	if !report.TotalInUSD.Equal(expectedTotalInUSD) ||
		!report.TotalOutUSD.Equal(expectedTotalOutUSD) ||
		!report.NetUSD.Equal(expectedNetUSD) {
		t.Fatalf("unexpected USD totals: in=%s (expected %s) out=%s (expected %s) net=%s (expected %s)",
			report.TotalInUSD.String(), expectedTotalInUSD.String(),
			report.TotalOutUSD.String(), expectedTotalOutUSD.String(),
			report.NetUSD.String(), expectedNetUSD.String(),
		)
	}

	if !report.TotalInVND.Equal(expectedTotalInVND) ||
		!report.TotalOutVND.Equal(expectedTotalOutVND) ||
		!report.NetVND.Equal(expectedNetVND) {
		t.Fatalf("unexpected VND totals: in=%s (expected %s) out=%s (expected %s) net=%s (expected %s)",
			report.TotalInVND.String(), expectedTotalInVND.String(),
			report.TotalOutVND.String(), expectedTotalOutVND.String(),
			report.NetVND.String(), expectedNetVND.String(),
		)
	}
}

// TestReportingService_GetCashFlow_IgnoresFXAfterEndDate proves that GetCashFlow
// always uses the latest FX rate with date <= EndDate, and does NOT pick up
// newer fx_rates rows inserted after the reporting period.
func TestReportingService_GetCashFlow_IgnoresFXAfterEndDate(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 3, 31, 0, 0, 0, 0, time.UTC)

	sqlDB := getSQLDB(t, tdb)
	// Seed a single FX rate <= EndDate
	if _, err := sqlDB.ExecContext(ctx,
		`INSERT INTO fx_rates (from_currency, to_currency, rate, date, source)
         VALUES ('USD', 'VND', 25000, $1, 'test')`, start); err != nil {
		t.Fatalf("failed to insert base fx_rate (25000): %v", err)
	}

	// Simple USD income so cashflow_local is well known.
	usdIncome := decimal.NewFromInt(100)
	tx := &models.Transaction{
		Date:       start.AddDate(0, 0, 1),
		Type:       "income",
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   usdIncome,
		PriceLocal: decimal.NewFromInt(1),
	}
	if err := txService.CreateTransaction(ctx, tx); err != nil {
		t.Fatalf("failed to create transaction: %v", err)
	}

	period := models.Period{StartDate: start, EndDate: end}
	report1, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow (first run) failed: %v", err)
	}

	// Now insert a newer FX rate AFTER EndDate; GetCashFlow must ignore it.
	if _, err := sqlDB.ExecContext(ctx,
		`INSERT INTO fx_rates (from_currency, to_currency, rate, date, source)
         VALUES ('USD', 'VND', 26000, $1, 'test')`, end.AddDate(0, 0, 1)); err != nil {
		t.Fatalf("failed to insert future fx_rate (26000): %v", err)
	}

	report2, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow (second run) failed: %v", err)
	}

	// All headline totals must be identical between runs.
	if !report1.TotalInUSD.Equal(report2.TotalInUSD) ||
		!report1.TotalOutUSD.Equal(report2.TotalOutUSD) ||
		!report1.NetUSD.Equal(report2.NetUSD) ||
		!report1.TotalInVND.Equal(report2.TotalInVND) ||
		!report1.TotalOutVND.Equal(report2.TotalOutVND) ||
		!report1.NetVND.Equal(report2.NetVND) {
		t.Fatalf("cashflow totals changed after inserting FX past EndDate:\nfirst:  in=%s out=%s net=%s / in_vnd=%s out_vnd=%s net_vnd=%s\nsecond: in=%s out=%s net=%s / in_vnd=%s out_vnd=%s net_vnd=%s",
			report1.TotalInUSD.String(), report1.TotalOutUSD.String(), report1.NetUSD.String(),
			report1.TotalInVND.String(), report1.TotalOutVND.String(), report1.NetVND.String(),
			report2.TotalInUSD.String(), report2.TotalOutUSD.String(), report2.NetUSD.String(),
			report2.TotalInVND.String(), report2.TotalOutVND.String(), report2.NetVND.String(),
		)
	}
}
