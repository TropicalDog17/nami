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

// Helper to build a stake transaction with derived fields
func buildStakeTx(date time.Time, account, asset string, qty, entryPrice float64, investmentID *string, horizon *string) *models.Transaction {
	tx := &models.Transaction{
		Date:         date,
		Type:         "stake",
		Asset:        asset,
		Account:      account,
		Quantity:     decimal.NewFromFloat(qty),
		PriceLocal:   decimal.NewFromFloat(entryPrice),
		FXToUSD:      decimal.NewFromInt(1),
		FXToVND:      decimal.NewFromInt(1),
		InvestmentID: investmentID,
		Horizon:      horizon,
	}
	_ = tx.PreSave()
	return tx
}

// Helper to build an unstake transaction with derived fields
func buildUnstakeTx(date time.Time, account, asset string, qty, exitPrice float64, investmentID *string, horizon *string) *models.Transaction {
	tx := &models.Transaction{
		Date:         date,
		Type:         "unstake",
		Asset:        asset,
		Account:      account,
		Quantity:     decimal.NewFromFloat(qty),
		PriceLocal:   decimal.NewFromFloat(exitPrice),
		FXToUSD:      decimal.NewFromInt(1),
		FXToVND:      decimal.NewFromInt(1),
		InvestmentID: investmentID,
		Horizon:      horizon,
	}
	_ = tx.PreSave()
	return tx
}

// Test staking into an existing investment by specifying InvestmentID, then partial and full unstakes
func TestInvestmentService_StakeIntoExisting_ThenUnstake_PartialAndFull(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	date1 := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	date2 := time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC)
	date3 := time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC)

	// Initial stake creates a new investment
	stake1 := buildStakeTx(date1, "Futures", "USDT", 200, 1.00, nil, nil)
	inv, err := invSvc.ProcessStake(ctx, stake1)
	if err != nil {
		t.Fatalf("ProcessStake failed: %v", err)
	}
	if inv == nil || inv.ID == "" {
		t.Fatalf("expected investment to be created")
	}

	// Stake more into the same investment by specifying InvestmentID
	invID := inv.ID
	stake2 := buildStakeTx(date1, "Futures", "USDT", 300, 1.00, &invID, nil)
	inv, err = invSvc.ProcessStake(ctx, stake2)
	if err != nil {
		t.Fatalf("ProcessStake (existing) failed: %v", err)
	}

	// Partial unstake 275 at price 1.10
	unstake1 := buildUnstakeTx(date2, "Futures", "USDT", 275, 1.10, &invID, nil)
	inv, err = invSvc.ProcessUnstake(ctx, unstake1)
	if err != nil {
		t.Fatalf("ProcessUnstake (partial) failed: %v", err)
	}
	if !inv.IsOpen {
		t.Fatalf("expected investment to remain open after partial unstake")
	}

	// Full close remaining at price 0.90
	unstake2 := buildUnstakeTx(date3, "Futures", "USDT", 225, 0.90, &invID, nil)
	inv, err = invSvc.ProcessUnstake(ctx, unstake2)
	if err != nil {
		t.Fatalf("ProcessUnstake (full) failed: %v", err)
	}
	if inv.IsOpen {
		t.Fatalf("expected investment to be closed after full unstake")
	}

	// Validate realized PnL: cost basis = 500 * 1.00 = 500
	// Withdrawals = 275*1.10 + 225*0.90 = 302.5 + 202.5 = 505.0
	// PnL = 5.0
	expected := decimal.NewFromFloat(5.0)
	if !inv.PnL.Equal(expected) {
		t.Fatalf("expected realized PnL %s, got %s", expected, inv.PnL)
	}
}
