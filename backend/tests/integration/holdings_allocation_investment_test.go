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

// Ensures holdings/allocation include quantities impacted by investments (stake/unstake), and that investment is tracked as investment not token activity
func TestHoldingsAllocation_IncludesInvestmentPositions(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)
	reportingSvc := services.NewReportingService(tdb.database)

	// Stake 500 USDT into Vault (investment account). Internal flows ensure no net cashflow.
	stakeReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "USDT",
			"amount":             500.0,
			"horizon":            "long-term",
		},
	}
	stakeResp, err := actionSvc.Perform(ctx, stakeReq)
	if err != nil {
		t.Fatalf("stake failed: %v", err)
	}
	if len(stakeResp.Transactions) < 2 {
		t.Fatalf("expected at least 2 transactions for stake, got %d", len(stakeResp.Transactions))
	}

	// As-of holdings after stake should reflect quantity at the investment account
	asOf := time.Date(2025, 1, 2, 0, 0, 0, 0, time.UTC)
	holdings, err := reportingSvc.GetHoldings(ctx, asOf)
	if err != nil {
		t.Fatalf("GetHoldings failed: %v", err)
	}

	// Find the USDT/Vault position
	var found bool
	for _, h := range holdings {
		if h.Asset == "USDT" && h.Account == "Vault" {
			found = true
			if !h.Quantity.Equal(decimal.NewFromInt(500)) {
				t.Fatalf("expected Vault USDT quantity 500, got %s", h.Quantity)
			}
		}
	}
	if !found {
		t.Fatalf("expected to find USDT holding in Vault account")
	}

	// Unstake partial 200 back to Binance Spot; remaining in Vault is 300
	unstakeReq := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                "2025-01-10",
			"investment_account":  "Vault",
			"destination_account": "Binance Spot",
			"asset":               "USDT",
			"amount":              200.0,
			"investment_id":       *stakeResp.Transactions[1].InvestmentID,
		},
	}
	if _, err := actionSvc.Perform(ctx, unstakeReq); err != nil {
		t.Fatalf("unstake failed: %v", err)
	}

	// Holdings as of a later date should reflect new balances
	asOf2 := time.Date(2025, 1, 11, 0, 0, 0, 0, time.UTC)
	holdings2, err := reportingSvc.GetHoldings(ctx, asOf2)
	if err != nil {
		t.Fatalf("GetHoldings (post-unstake) failed: %v", err)
	}

	var vaultQty, spotQty decimal.Decimal
	for _, h := range holdings2 {
		if h.Asset == "USDT" && h.Account == "Vault" {
			vaultQty = h.Quantity
		}
		if h.Asset == "USDT" && h.Account == "Binance Spot" {
			spotQty = h.Quantity
		}
	}
	if !vaultQty.Equal(decimal.NewFromInt(300)) {
		t.Fatalf("expected Vault quantity 300 after partial unstake, got %s", vaultQty)
	}
	if !spotQty.Equal(decimal.NewFromInt(200)) {
		t.Fatalf("expected Binance Spot quantity 200 after partial unstake, got %s", spotQty)
	}
}
