package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// Verifies: normal expenses across accounts, and credit card repay tracking
func TestCreditCardExpenseAndRepayFlow(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	actionService := services.NewActionService(tdb.database, txService)
	reportingService := services.NewReportingService(tdb.database)

	start := time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC)

	// 1) Create normal expense from Cash account -> negative cashflow
	cashExpense := &models.Transaction{
		Date:       start,
		Type:       "expense",
		Asset:      "USD",
		Account:    "Cash",
		Quantity:   decimal.NewFromInt(1),
		PriceLocal: decimal.NewFromInt(50),
		FXToUSD:    decimal.NewFromInt(1),
		FXToVND:    decimal.NewFromInt(25000),
	}
	if err := txService.CreateTransaction(ctx, cashExpense); err != nil {
		t.Fatalf("failed to create cash expense: %v", err)
	}
	gotCash, err := txService.GetTransaction(ctx, cashExpense.ID)
	if err != nil {
		t.Fatalf("failed to reload cash expense: %v", err)
	}
	if !gotCash.CashFlowUSD.Equal(decimal.NewFromInt(-50)) {
		t.Fatalf("expected cash expense cashflow -50 USD, got %s", gotCash.CashFlowUSD)
	}

	// 2) Create normal expense from Bank account -> negative cashflow
	bankExpense := &models.Transaction{
		Date:       start.AddDate(0, 0, 0),
		Type:       "expense",
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   decimal.NewFromInt(1),
		PriceLocal: decimal.NewFromInt(30),
		FXToUSD:    decimal.NewFromInt(1),
		FXToVND:    decimal.NewFromInt(25000),
	}
	if err := txService.CreateTransaction(ctx, bankExpense); err != nil {
		t.Fatalf("failed to create bank expense: %v", err)
	}
	gotBank, err := txService.GetTransaction(ctx, bankExpense.ID)
	if err != nil {
		t.Fatalf("failed to reload bank expense: %v", err)
	}
	if !gotBank.CashFlowUSD.Equal(decimal.NewFromInt(-30)) {
		t.Fatalf("expected bank expense cashflow -30 USD, got %s", gotBank.CashFlowUSD)
	}

	// 3) Create credit card expense -> zero immediate cashflow
	ccExpense := &models.Transaction{
		Date:       start.AddDate(0, 0, 0),
		Type:       "expense",
		Asset:      "USD",
		Account:    "CreditCard",
		Quantity:   decimal.NewFromInt(1),
		PriceLocal: decimal.NewFromInt(100),
		FXToUSD:    decimal.NewFromInt(1),
		FXToVND:    decimal.NewFromInt(25000),
	}
	if err := txService.CreateTransaction(ctx, ccExpense); err != nil {
		t.Fatalf("failed to create credit card expense: %v", err)
	}
	gotCC, err := txService.GetTransaction(ctx, ccExpense.ID)
	if err != nil {
		t.Fatalf("failed to reload credit card expense: %v", err)
	}
	if !gotCC.CashFlowUSD.Equal(decimal.Zero) {
		t.Fatalf("expected credit card expense cashflow 0 USD, got %s", gotCC.CashFlowUSD)
	}

	// 4) Repay credit card using repay_borrow action (financing outflow)
	repayReq := &models.ActionRequest{
		Action: models.ActionRepayBorrow,
		Params: map[string]interface{}{
			"date":    start.AddDate(0, 0, 2).Format("2006-01-02"),
			"account": "Bank",
			"asset":   "USD",
			"amount":  100.0,
			"fx_to_usd": 1.0,
			"fx_to_vnd": 25000.0,
		},
	}
	repayResp, err := actionService.Perform(ctx, repayReq)
	if err != nil {
		t.Fatalf("repay_borrow failed: %v", err)
	}
	if len(repayResp.Transactions) != 1 {
		t.Fatalf("expected 1 transaction from repay, got %d", len(repayResp.Transactions))
	}
	repayTx := repayResp.Transactions[0]
	if repayTx.Type != "repay_borrow" {
		t.Fatalf("expected type repay_borrow, got %s", repayTx.Type)
	}
	if !repayTx.CashFlowUSD.Equal(decimal.NewFromInt(-100)) {
		t.Fatalf("expected repay cashflow -100 USD, got %s", repayTx.CashFlowUSD)
	}

	// 5) Cash flow report should classify repay under financing outflows; credit card expense excluded from spending
	period := models.Period{StartDate: start.AddDate(0, 0, -1), EndDate: start.AddDate(0, 0, 5)}
	cf, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow failed: %v", err)
	}
	if !cf.FinancingOutUSD.Equal(decimal.NewFromInt(100)) {
		t.Fatalf("expected financing outflow 100 USD, got %s", cf.FinancingOutUSD)
	}

	spending, err := reportingService.GetSpending(ctx, period)
	if err != nil {
		t.Fatalf("GetSpending failed: %v", err)
	}
	// Only cash/bank expenses contribute to spending totals (credit card expense has zero cashflow)
	expectedSpending := decimal.NewFromInt(80) // 50 + 30
	if !spending.TotalUSD.Equal(expectedSpending) {
		t.Fatalf("expected total spending %s USD, got %s", expectedSpending, spending.TotalUSD)
	}
}
