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

func TestReports_TrendsAndPerformance(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	start := time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2025, 7, 31, 0, 0, 0, 0, time.UTC)

	// 1. Seed Spending Data for Trends
	// Day 1: 50 USD
	tx1 := &models.Transaction{
		Date:       start.AddDate(0, 0, 0),
		Type:       "expense",
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   decimal.NewFromFloat(50),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}
	// Day 2: 100 USD
	tx2 := &models.Transaction{
		Date:       start.AddDate(0, 0, 1),
		Type:       "expense",
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   decimal.NewFromFloat(100),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}
	if err := txService.CreateTransaction(ctx, tx1); err != nil {
		t.Fatalf("failed to create tx1: %v", err)
	}
	if err := txService.CreateTransaction(ctx, tx2); err != nil {
		t.Fatalf("failed to create tx2: %v", err)
	}

	// 2. Verify Spending Trends (ByDay)
	period := models.Period{StartDate: start, EndDate: end}
	spendingReport, err := reportingService.GetSpending(ctx, period)
	if err != nil {
		t.Fatalf("GetSpending failed: %v", err)
	}

	day1Key := start.Format("2006-01-02")
	day2Key := start.AddDate(0, 0, 1).Format("2006-01-02")

	if spendingReport.ByDay[day1Key] == nil {
		t.Errorf("expected spending for %s", day1Key)
	} else if !spendingReport.ByDay[day1Key].AmountUSD.Equal(decimal.NewFromFloat(50)) {
		t.Errorf("expected 50 USD for day 1, got %s", spendingReport.ByDay[day1Key].AmountUSD.String())
	}

	if spendingReport.ByDay[day2Key] == nil {
		t.Errorf("expected spending for %s", day2Key)
	} else if !spendingReport.ByDay[day2Key].AmountUSD.Equal(decimal.NewFromFloat(100)) {
		t.Errorf("expected 100 USD for day 2, got %s", spendingReport.ByDay[day2Key].AmountUSD.String())
	}

	// 3. Seed Investment Data for PnL
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txRepo := repositories.NewTransactionRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)

	// Buy 1 BTC at 50k
	buyTx := &models.Transaction{
		Date:       start.AddDate(0, 0, 5),
		Type:       "buy",
		Asset:      "BTC",
		Account:    "Exchange",
		Quantity:   decimal.NewFromFloat(1),
		PriceLocal: decimal.NewFromFloat(50000),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}
	// Ensure pre-save is called to populate AmountUSD
	if err := buyTx.PreSave(); err != nil {
		t.Fatalf("failed to presave buyTx: %v", err)
	}
	
	// Use CreateDeposit to track investment
	if _, err := invSvc.CreateDeposit(ctx, buyTx); err != nil {
		t.Fatalf("failed to create deposit: %v", err)
	}

	// Sell 1 BTC at 60k (Realized PnL = 10k)
	sellTx := &models.Transaction{
		Date:       start.AddDate(0, 0, 10),
		Type:       "sell",
		Asset:      "BTC",
		Account:    "Exchange",
		Quantity:   decimal.NewFromFloat(1),
		PriceLocal: decimal.NewFromFloat(60000),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}
	if err := sellTx.PreSave(); err != nil {
		t.Fatalf("failed to presave sellTx: %v", err)
	}

	// Use CreateWithdrawal to track investment exit
	if _, err := invSvc.CreateWithdrawal(ctx, sellTx); err != nil {
		t.Fatalf("failed to create withdrawal: %v", err)
	}

	// 4. Verify PnL Report
	pnlReport, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		t.Fatalf("GetPnL failed: %v", err)
	}

	expectedRealized := decimal.NewFromFloat(10000)
	if !pnlReport.RealizedPnLUSD.Equal(expectedRealized) {
		t.Errorf("expected realized PnL %s, got %s", expectedRealized.String(), pnlReport.RealizedPnLUSD.String())
	}
}
