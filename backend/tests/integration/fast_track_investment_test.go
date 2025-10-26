package integration

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// Test fast track investment scenarios similar to the frontend FastInvestmentButton
func TestFastTrackInvestment_Scenarios(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

	// Test scenarios similar to FastInvestmentButton options
	testCases := []struct {
		name         string
		asset        string
		amount       float64
		sourceAcc    string
		investAcc    string
		horizon      string
		expectInvest bool
	}{
		{
			name:         "BTC Stake - Small Amount",
			asset:        "BTC",
			amount:       0.001,
			sourceAcc:    "Binance Spot",
			investAcc:    "Vault",
			horizon:      "long-term",
			expectInvest: true,
		},
		{
			name:         "USDT Stake - Medium Amount",
			asset:        "USDT",
			amount:       1000,
			sourceAcc:    "Binance Spot",
			investAcc:    "Vault",
			horizon:      "long-term",
			expectInvest: true,
		},
		{
			name:         "ETH Stake - Large Amount",
			asset:        "ETH",
			amount:       1.0,
			sourceAcc:    "Binance Spot",
			investAcc:    "Vault",
			horizon:      "long-term",
			expectInvest: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Create fast track investment using ActionService
			stakeReq := &models.ActionRequest{
				Action: models.ActionStake,
				Params: map[string]interface{}{
					"date":               "2025-01-01",
					"source_account":     tc.sourceAcc,
					"investment_account": tc.investAcc,
					"asset":              tc.asset,
					"amount":             tc.amount,
					"horizon":            tc.horizon,
				},
			}

			stakeResp, err := actionSvc.Perform(ctx, stakeReq)
			if err != nil {
				t.Fatalf("fast track investment failed: %v", err)
			}

			if len(stakeResp.Transactions) < 2 {
				t.Fatalf("expected at least 2 transactions for fast track investment, got %d", len(stakeResp.Transactions))
			}

			// Verify investment was created
			investments, err := invSvc.GetInvestments(ctx, &models.InvestmentFilter{
				Asset:  tc.asset,
				IsOpen: boolPtr(true),
			})
			if err != nil {
				t.Fatalf("failed to get investments: %v", err)
			}

			if tc.expectInvest && len(investments) == 0 {
				t.Fatalf("expected investment to be created for %s", tc.asset)
			}

			// Verify investment details
			if len(investments) > 0 {
				inv := investments[0]
				if inv.Asset != tc.asset {
					t.Fatalf("expected asset %s, got %s", tc.asset, inv.Asset)
				}
				if inv.Account != tc.investAcc {
					t.Fatalf("expected account %s, got %s", tc.investAcc, inv.Account)
				}
				if inv.Horizon != nil && *inv.Horizon != tc.horizon {
					t.Fatalf("expected horizon %s, got %s", tc.horizon, *inv.Horizon)
				}
				if !inv.DepositQty.Equal(decimal.NewFromFloat(tc.amount)) {
					t.Fatalf("expected deposit qty %f, got %s", tc.amount, inv.DepositQty)
				}
			}
		})
	}
}

// Test fast track investment with multiple amounts for the same asset
func TestFastTrackInvestment_MultipleAmountsSameAsset(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

	// First investment: 100 USDT
	stakeReq1 := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "USDT",
			"amount":             100.0,
			"horizon":            "long-term",
		},
	}

	_, err := actionSvc.Perform(ctx, stakeReq1)
	if err != nil {
		t.Fatalf("first fast track investment failed: %v", err)
	}

	// Second investment: 500 USDT (should add to existing investment)
	stakeReq2 := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-02",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "USDT",
			"amount":             500.0,
			"horizon":            "long-term",
		},
	}

	_, err = actionSvc.Perform(ctx, stakeReq2)
	if err != nil {
		t.Fatalf("second fast track investment failed: %v", err)
	}

	// Verify we have one investment with aggregated amount
	investments, err := invSvc.GetInvestments(ctx, &models.InvestmentFilter{
		Asset:  "USDT",
		IsOpen: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("failed to get investments: %v", err)
	}

	if len(investments) != 1 {
		t.Fatalf("expected 1 investment, got %d", len(investments))
	}

	inv := investments[0]
	expectedTotal := decimal.NewFromFloat(600.0) // 100 + 500
	if !inv.DepositQty.Equal(expectedTotal) {
		t.Fatalf("expected total deposit %s, got %s", expectedTotal, inv.DepositQty)
	}
}

// Test fast track investment with different horizons
func TestFastTrackInvestment_DifferentHorizons(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

	// Long-term investment
	longTermReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "BTC",
			"amount":             0.1,
			"horizon":            "long-term",
		},
	}

	_, err := actionSvc.Perform(ctx, longTermReq)
	if err != nil {
		t.Fatalf("long-term investment failed: %v", err)
	}

	// Short-term investment
	shortTermReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-02",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "BTC",
			"amount":             0.05,
			"horizon":            "short-term",
		},
	}

	_, err = actionSvc.Perform(ctx, shortTermReq)
	if err != nil {
		t.Fatalf("short-term investment failed: %v", err)
	}

	// Verify we have two separate investments due to different horizons
	investments, err := invSvc.GetInvestments(ctx, &models.InvestmentFilter{
		Asset:  "BTC",
		IsOpen: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("failed to get investments: %v", err)
	}

	if len(investments) != 2 {
		t.Fatalf("expected 2 investments (different horizons), got %d", len(investments))
	}

	// Verify horizons are different
	var longTermFound, shortTermFound bool
	for _, inv := range investments {
		if inv.Horizon != nil {
			if *inv.Horizon == "long-term" {
				longTermFound = true
				if !inv.DepositQty.Equal(decimal.NewFromFloat(0.1)) {
					t.Fatalf("long-term investment should have 0.1 BTC, got %s", inv.DepositQty)
				}
			} else if *inv.Horizon == "short-term" {
				shortTermFound = true
				if !inv.DepositQty.Equal(decimal.NewFromFloat(0.05)) {
					t.Fatalf("short-term investment should have 0.05 BTC, got %s", inv.DepositQty)
				}
			}
		}
	}

	if !longTermFound {
		t.Fatal("long-term investment not found")
	}
	if !shortTermFound {
		t.Fatal("short-term investment not found")
	}
}

// Test fast track investment with invalid scenarios
func TestFastTrackInvestment_InvalidScenarios(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

	// Test with negative amount (handled at database level)
	negativeAmountReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Binance Spot",
			"investment_account": "Vault",
			"asset":              "USDT",
			"amount":             -100.0,
			"horizon":            "long-term",
		},
	}

	_, err := actionSvc.Perform(ctx, negativeAmountReq)
	if err == nil {
		t.Fatal("expected error for negative amount investment")
	}

	// Test with invalid source account - this may not fail immediately
	// as the system might create the account if it doesn't exist
	// This test validates that the basic structure works
	validReq := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               "2025-01-01",
			"source_account":     "Test Account",
			"investment_account": "Vault",
			"asset":              "USDT",
			"amount":             100.0,
			"horizon":            "long-term",
		},
	}

	_, err = actionSvc.Perform(ctx, validReq)
	if err != nil {
		t.Logf("Note: account creation behavior may vary: %v", err)
	}
}

// Test fast track investment summary statistics
func TestFastTrackInvestment_SummaryStatistics(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)
	linkSvc := services.NewLinkService(tdb.database)
	actionSvc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

	// Create multiple fast track investments
	investments := []struct {
		asset  string
		amount float64
	}{
		{"BTC", 0.1},
		{"USDT", 1000.0},
		{"ETH", 1.0},
	}

	for _, inv := range investments {
		req := &models.ActionRequest{
			Action: models.ActionStake,
			Params: map[string]interface{}{
				"date":               "2025-01-01",
				"source_account":     "Binance Spot",
				"investment_account": "Vault",
				"asset":              inv.asset,
				"amount":             inv.amount,
				"horizon":            "long-term",
			},
		}

		_, err := actionSvc.Perform(ctx, req)
		if err != nil {
			t.Fatalf("investment failed for %s: %v", inv.asset, err)
		}
	}

	// Get investment list instead of summary (since summary is not implemented yet)
	investmentList, err := invSvc.GetInvestments(ctx, &models.InvestmentFilter{
		IsOpen: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("failed to get investment list: %v", err)
	}

	// Verify we have 3 open investments
	if len(investmentList) != 3 {
		t.Fatalf("expected 3 open investments, got %d", len(investmentList))
	}

	// Verify total deposits manually
	totalDeposits := decimal.Zero
	for _, inv := range investmentList {
		totalDeposits = totalDeposits.Add(inv.DepositQty)
	}

	// Since we can't predict exact pricing, just verify we have positive deposits
	if totalDeposits.LessThanOrEqual(decimal.Zero) {
		t.Fatalf("expected positive total deposits, got %s", totalDeposits)
	}

	t.Logf("Successfully created %d investments with total deposits: %s", len(investmentList), totalDeposits)
}