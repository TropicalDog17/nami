package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestReportingService_GetExpectedBorrowOutflows_WithAPR(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	reportingService := services.NewReportingService(tdb.database)
	txService := services.NewTransactionService(tdb.database)

	start := time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC)
	asOf := time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC)

	apr := decimal.NewFromFloat(0.12) // 12% APR
	term := 30                        // 30 days term

	// Borrow 1000, then partial repay 200
	borrow := &models.Transaction{
		Date:           start,
		Type:           "borrow",
		Asset:          "USD",
		Account:        "Bank",
		Quantity:       decimal.NewFromInt(1000),
		PriceLocal:     decimal.NewFromInt(1),
		FXToUSD:        decimal.NewFromInt(1),
		FXToVND:        decimal.NewFromInt(25000),
		BorrowAPR:      &apr,
		BorrowTermDays: &term,
	}
	if err := txService.CreateTransaction(ctx, borrow); err != nil {
		t.Fatalf("failed to create borrow: %v", err)
	}

	repay := &models.Transaction{
		Date:       start.AddDate(0, 0, 5),
		Type:       "repay_borrow",
		Asset:      "USD",
		Account:    "Bank",
		Quantity:   decimal.NewFromInt(200),
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromInt(1),
		FXToVND:    decimal.NewFromInt(25000),
	}
	if err := txService.CreateTransaction(ctx, repay); err != nil {
		t.Fatalf("failed to create repay: %v", err)
	}

	projections, err := reportingService.GetExpectedBorrowOutflows(ctx, asOf)
	if err != nil {
		t.Fatalf("GetExpectedBorrowOutflows failed: %v", err)
	}

	if len(projections) == 0 {
		t.Fatalf("expected at least one outflow projection")
	}

	// Find our projection (by account/asset)
	var p *models.OutflowProjection
	for _, pr := range projections {
		if pr.Account == "Bank" && pr.Asset == "USD" {
			p = pr
			break
		}
	}
	if p == nil {
		t.Fatalf("could not find projection for Bank/USD")
	}

	// Remaining principal: 1000 - 200 = 800
	expectedRemaining := decimal.NewFromInt(800)
	if !p.RemainingPrincipal.Equal(expectedRemaining) {
		t.Fatalf("expected remaining principal %s, got %s", expectedRemaining.String(), p.RemainingPrincipal.String())
	}

	// Days remaining from asOf to term end: start + 30 days = Mar 31; asOf Mar 15 => 16 days
	// interest = remaining * apr * days / 365
	interest := expectedRemaining.Mul(apr).Mul(decimal.NewFromInt(16)).Div(decimal.NewFromInt(365))
	if !p.InterestAccrued.Equal(interest) {
		t.Fatalf("expected interest %s, got %s", interest.String(), p.InterestAccrued.String())
	}

	expectedTotal := expectedRemaining.Add(interest)
	if !p.TotalOutflow.Equal(expectedTotal) {
		t.Fatalf("expected total outflow %s, got %s", expectedTotal.String(), p.TotalOutflow.String())
	}
}
