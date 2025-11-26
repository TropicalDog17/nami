package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestCreditCard_Flow(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	svc := services.NewActionService(tdb.database, txService)
	reportingService := services.NewReportingService(tdb.database)

	start := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 6, 30, 0, 0, 0, 0, time.UTC)

	// 1. Spend 100 USD on Credit Card
	// Mock FX provider behavior by manually setting FX rates if needed,
	// but ActionCreditSpend uses 0 FX rates and relies on TransactionService to populate.
	// Since we use NewActionService without price service, we might need to ensure FX is handled or manually create tx.
	// Actually, ActionCreditSpend creates a transaction with 0 FX.
	// Let's use manual transaction creation to be safe and precise about FX for this test.

	ccSpend := &models.Transaction{
		Date:       start,
		Type:       "expense",
		Asset:      "USD",
		Account:    "CreditCard",
		Quantity:   decimal.NewFromFloat(100),
		PriceLocal: decimal.NewFromFloat(1),
		Tag:        stringPtr("Shopping"),
	}
	if err := txService.CreateTransaction(ctx, ccSpend); err != nil {
		t.Fatalf("failed to create CC spend: %v", err)
	}
	t.Logf("Created Tx: Account='%s', Type='%s', CashFlowLocal=%s", ccSpend.Account, ccSpend.Type, ccSpend.CashFlowLocal.String())

	// Verify Cashflow is 0
	period := models.Period{StartDate: start, EndDate: end}
	report, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow failed: %v", err)
	}
	if !report.NetUSD.IsZero() {
		t.Fatalf("expected zero cashflow for CC spend, got %s", report.NetUSD.String())
	}

	// 2. Repay Credit Card (Transfer from Bank)
	// This IS a cashflow event (outflow from Bank) if we consider Bank->CC as just a transfer?
	// Wait, paying off a credit card is usually a transfer between accounts (Asset: Bank, Liability: CC).
	// If both are tracked accounts, it's an internal transfer -> Net Cashflow 0.
	// But if we want to track "Spending" when we pay the bill?
	// The model says: "InternalFlow ... Zero out cash flow for internal trades/transfers".
	// So if we transfer Bank -> CreditCard, it's internal.
	// The "Expense" happened at step 1 (but with 0 cashflow).
	// This implies that Credit Card spending is tracked in "Spending Report" but not "Cashflow Report" until... when?
	// Actually, `spending_report_test.go` says "Credit card expense: cashflow is zero; should not count as spending".
	// Wait, line 97 of `spending_report_test.go`: "Credit card expense: cashflow is zero; should not count as spending".
	// This implies CC spending is NOT spending? That seems wrong for a spending tracker.
	// Let's re-read `spending_report_test.go`.
	// Line 125: "Expected totals: expenses 20 + 15 + 5 = 40 USD; credit card expense ignored due to zero cashflow".
	// This means the current implementation IGNORES credit card spending in the Spending Report.
	// This might be a feature (cash-basis accounting) or a bug/limitation.
	// If it's cash-basis, then the Repayment should count as the expense/outflow.

	// Let's test the Repayment.
	repayReq := &models.ActionRequest{
		Action: models.ActionInternalTransfer,
		Params: map[string]interface{}{
			"date":                start.AddDate(0, 0, 20).Format("2006-01-02"),
			"source_account":      "Bank A",
			"destination_account": "CreditCard",
			"asset":               "USD",
			"amount":              100.0,
		},
	}
	repayResp, err := svc.Perform(ctx, repayReq)
	if err != nil {
		t.Fatalf("repay CC failed: %v", err)
	}
	if len(repayResp.Transactions) != 2 {
		t.Fatalf("expected 2 txs for repay")
	}

	// Verify Cashflow again.
	// Since it's an internal transfer, Cashflow should STILL be 0?
	// If so, Credit Card spending is never captured in Cashflow?
	// That would be a gap.

	// Let's check the code in `models/transaction.go`:
	// if t.Account == "CreditCard" && t.Type == "expense" { t.CashFlowUSD = decimal.Zero }

	// If I pay the CC, it's a transfer.
	// if t.InternalFlow ... t.CashFlowUSD = decimal.Zero.

	// So CC spending is invisible in Cashflow?
	// Unless the repayment is NOT marked as internal?
	// But `ActionInternalTransfer` marks it as internal.

	// Maybe there is a specific "repay_liability" action?
	// `models/transaction.go` has `repay_borrow`.

	// For now, I will verify the current behavior:
	// 1. CC Spend -> 0 Cashflow.
	// 2. CC Repay (Internal Transfer) -> 0 Cashflow.
	// This confirms the system behaves as currently coded, even if the accounting logic is debatable (pure cash basis would count repayment as outflow if CC is external, but here CC is an account).

	report2, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow 2 failed: %v", err)
	}
	if !report2.NetUSD.IsZero() {
		t.Fatalf("expected zero cashflow for CC repay (internal), got %s", report2.NetUSD.String())
	}
}
