package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestReportingHandlers_SpendingAndCashflow(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)
	h := handlers.NewReportingHandler(reportingService)

	// Seed minimal data: one expense 10, one income 25
	start := time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 4, 30, 0, 0, 0, 0, time.UTC)

	if err := txService.CreateTransaction(ctx, testTxUSD(start.AddDate(0, 0, 1), "expense", 10)); err != nil {
		t.Fatalf("failed to create expense: %v", err)
	}
	if err := txService.CreateTransaction(ctx, testTxUSD(start.AddDate(0, 0, 2), "income", 25)); err != nil {
		t.Fatalf("failed to create income: %v", err)
	}

	// Spending handler
	req := httptest.NewRequest(http.MethodGet, "/api/reports/spending?start_date="+start.Format("2006-01-02")+"&end_date="+end.Format("2006-01-02"), nil)
	rr := httptest.NewRecorder()
	h.HandleSpending(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("spending handler returned status %d", rr.Code)
	}
	var spendingResp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &spendingResp); err != nil {
		t.Fatalf("failed to decode spending response: %v", err)
	}
	if spendingResp["total_usd"] == nil {
		t.Fatalf("expected total_usd in spending response")
	}

	// Cashflow handler
	req2 := httptest.NewRequest(http.MethodGet, "/api/reports/cashflow?start_date="+start.Format("2006-01-02")+"&end_date="+end.Format("2006-01-02"), nil)
	rr2 := httptest.NewRecorder()
	h.HandleCashFlow(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("cashflow handler returned status %d", rr2.Code)
	}
	var cashflowResp map[string]interface{}
	if err := json.Unmarshal(rr2.Body.Bytes(), &cashflowResp); err != nil {
		t.Fatalf("failed to decode cashflow response: %v", err)
	}
	if cashflowResp["total_in_usd"] == nil || cashflowResp["total_out_usd"] == nil {
		t.Fatalf("expected total_in_usd and total_out_usd in cashflow response")
	}
}

// helper to quickly construct a USD transaction with quantity=amount, price=1
func testTxUSD(date time.Time, kind string, amount float64) *models.Transaction {
	return &models.Transaction{
		Date:       date,
		Type:       kind,
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   decimal.NewFromFloat(amount),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(25000),
	}
}
