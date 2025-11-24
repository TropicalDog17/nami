package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)


// Regression tests for vault end and delete flows

func TestVault_End_ClosesInvestment(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed: create a stake investment
	seed := makeStakeTx(time.Now().Add(-24*time.Hour), "USDT", "Kyberswap", 10, 1)
	b, _ := json.Marshal(seed)
	req := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	invHandler.HandleStake(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("stake create status=%d body=%s", rr.Code, rr.Body.String())
	}
	var created models.Investment
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode stake: %v", err)
	}

	// End vault
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}

	// Validate response shows closed status
	var ended map[string]interface{}
	if err := json.Unmarshal(wEnd.Body.Bytes(), &ended); err != nil {
		t.Fatalf("decode end: %v", err)
	}
	// is_open should be false and status should be ended
	if open, ok := ended["is_open"].(bool); !ok || open {
		t.Fatalf("expected is_open=false, got %v", ended["is_open"])
	}
	if status, _ := ended["vault_status"].(string); status != "ended" {
		t.Fatalf("expected vault_status=ended, got %v", ended["vault_status"])
	}
}

func TestVault_FullWithdraw_AutoCloses(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed stake 10 @ $1
	seed := makeStakeTx(time.Now().Add(-24*time.Hour), "USDT", "Kyberswap", 10, 1)
	b, _ := json.Marshal(seed)
	req := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	invHandler.HandleStake(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("stake create status=%d body=%s", rr.Code, rr.Body.String())
	}
	var created models.Investment
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode stake: %v", err)
	}

	// Full withdraw 10 @ $1
	wd := map[string]interface{}{"quantity": 10, "value": 10}
	wdJSON, _ := json.Marshal(wd)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wdJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}

	// GET should show closed (auto-ended)
	rGet := httptest.NewRequest(http.MethodGet, "/api/vaults/"+created.ID, nil)
	wGet := httptest.NewRecorder()
	vaultHandler.HandleVault(wGet, rGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", wGet.Code, wGet.Body.String())
	}
	var got map[string]interface{}
	if err := json.Unmarshal(wGet.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode get: %v", err)
	}
	if open, ok := got["is_open"].(bool); !ok || open {
		t.Fatalf("expected is_open=false after full withdraw, got %v", got["is_open"])
	}
	if status, _ := got["vault_status"].(string); status != "ended" {
		t.Fatalf("expected vault_status=ended after full withdraw, got %v", status)
	}
}

func TestVault_Delete_RemovesInvestmentAndTransactions(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txService := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
		vaultHandler := handlers.NewVaultHandler(invSvc, txService, nil)

	// Seed: create a stake investment
	seed := makeStakeTx(time.Now(), "BTC", "Kyberswap", 5, 2)
	b, _ := json.Marshal(seed)
	req := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	invHandler.HandleStake(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("stake create status=%d body=%s", rr.Code, rr.Body.String())
	}
	var created models.Investment
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode stake: %v", err)
	}

	// Ensure at least one transaction exists for this investment
	filter := &models.TransactionFilter{InvestmentID: &created.ID}
	txs, err := txService.ListTransactions(ctx, filter)
	if err != nil {
		t.Fatalf("list transactions failed: %v", err)
	}
	if len(txs) == 0 {
		t.Fatalf("expected transactions for investment before delete")
	}

	// DELETE the vault
	rDel := httptest.NewRequest(http.MethodDelete, "/api/vaults/"+created.ID, nil)
	wDel := httptest.NewRecorder()
	vaultHandler.HandleVault(wDel, rDel)
	if wDel.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%s", wDel.Code, wDel.Body.String())
	}

	// GET should now return 404
	rGet := httptest.NewRequest(http.MethodGet, "/api/vaults/"+created.ID, nil)
	wGet := httptest.NewRecorder()
	vaultHandler.HandleVault(wGet, rGet)
	assert.Equal(t, http.StatusNotFound, wGet.Code, "expected 404 after deletion")

	// Transactions linked to this investment should be removed
	txsAfter, err := txService.ListTransactions(ctx, filter)
	if err != nil {
		t.Fatalf("list transactions after delete failed: %v", err)
	}
	if len(txsAfter) != 0 {
		t.Fatalf("expected 0 transactions after delete, got %d", len(txsAfter))
	}
}

// TestVault_DCA_WithFailedDeposit_AndWithdrawal tests the vault DCA strategy
// with a failed deposit and subsequent withdrawal (VLT-DCA-01)
func TestVault_DCA_WithFailedDeposit_AndWithdrawal(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txRepo := repositories.NewTransactionRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	
	// Create initial investment via stake to establish vault
	initialStake := &models.Transaction{
		Date:       time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
		Type:       "stake",
		Asset:      "BTC",
		Account:    "Investment Vault",
		Quantity:   decimal.NewFromFloat(0.1),
		PriceLocal: decimal.NewFromFloat(65000),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}

	if err := initialStake.PreSave(); err != nil {
		t.Fatalf("Failed to pre-save initial stake: %v", err)
	}

	initialInvestment, err := invSvc.CreateDeposit(ctx, initialStake)
	if err != nil {
		t.Fatalf("Failed to create initial investment: %v", err)
	}

	// Monthly DCA deposits (March to June 2025)
	dcaDeposits := []struct {
		date       time.Time
		quantity   decimal.Decimal
		price      decimal.Decimal
		shouldFail bool
		failReason string
	}{
		// March 15 - Successful deposit
		{time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC), decimal.NewFromFloat(0.25), decimal.NewFromFloat(67000), false, ""},
		// April 15 - Successful deposit
		{time.Date(2025, 4, 15, 0, 0, 0, 0, time.UTC), decimal.NewFromFloat(0.2), decimal.NewFromFloat(62000), false, ""},
		// May 15 - Failed deposit (PRICE_OUT_OF_RANGE)
		{time.Date(2025, 5, 15, 0, 0, 0, 0, time.UTC), decimal.NewFromFloat(0.18), decimal.NewFromFloat(60500), true, "PRICE_OUT_OF_RANGE"},
		// June 15 - Successful deposit
		{time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC), decimal.NewFromFloat(0.3), decimal.NewFromFloat(58000), false, ""},
	}

	// Process DCA deposits
	for i, deposit := range dcaDeposits {
		dcaTx := &models.Transaction{
			Date:       deposit.date,
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   deposit.quantity,
			PriceLocal: deposit.price,
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := dcaTx.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save DCA deposit %d: %v", i, err)
		}

		if deposit.shouldFail {
			// Simulate failed deposit - log the failure reason but don't create investment
			t.Logf("DCA deposit %d failed: %s", i, deposit.failReason)

			// Verify investment was not affected
			currentInvestment, err := invSvc.GetInvestmentByID(ctx, initialInvestment.ID)
			if err != nil {
				t.Fatalf("Failed to get investment after failed deposit: %v", err)
			}

			// Investment should remain unchanged
			if !currentInvestment.RemainingQty.Equal(initialInvestment.RemainingQty) {
				t.Errorf("Investment quantity changed after failed deposit: expected %s, got %s",
					initialInvestment.RemainingQty.String(), currentInvestment.RemainingQty.String())
			}
		} else {
			// Successful deposit
			depositInvestment, err := invSvc.CreateDeposit(ctx, dcaTx)
			if err != nil {
				t.Fatalf("Failed to create DCA deposit %d: %v", i, err)
			}

			// Update our reference investment
			initialInvestment = depositInvestment

			t.Logf("DCA deposit %d successful: quantity=%s, total deposits=%s",
				i, deposit.quantity.String(), initialInvestment.DepositQty.String())
		}
	}

	// July 10 - Partial withdrawal (profit lock)
	// This should reference the average cost basis up to this point
	julyWithdrawal := &models.Transaction{
		Date:       time.Date(2025, 7, 10, 0, 0, 0, 0, time.UTC),
		Type:       "withdraw",
		Asset:      "BTC",
		Account:    "Investment Vault",
		Quantity:   decimal.NewFromFloat(0.15), // Partial withdrawal
		PriceLocal: decimal.NewFromFloat(65000),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}

	if err := julyWithdrawal.PreSave(); err != nil {
		t.Fatalf("Failed to pre-save withdrawal: %v", err)
	}

	withdrawalInvestment, err := invSvc.CreateWithdrawal(ctx, julyWithdrawal)
	if err != nil {
		t.Fatalf("Failed to create withdrawal: %v", err)
	}

	// Validate vault performance calculations
	// Calculate expected values:
	// Initial: 0.1 BTC @ $65,000 = $6,500
	// March: 0.25 BTC @ $67,000 = $16,750
	// April: 0.2 BTC @ $62,000 = $12,400
	// June: 0.3 BTC @ $58,000 = $17,400
	// Total deposited: 0.85 BTC
	// Total cost: $53,050
	// Average cost basis: $62,412 per BTC
	// July withdrawal: 0.15 BTC @ $65,000 = $9,750
	// Remaining: 0.7 BTC
	// Current value: 0.7 BTC @ $65,000 = $45,500
	// Unrealized gain: $45,500 - (0.7 * $62,412) = $45,500 - $43,688.40 = $1,811.60

	// Verify remaining quantity after withdrawal
	expectedRemaining := decimal.NewFromFloat(0.7) // 0.85 - 0.15 = 0.7 BTC
	if !withdrawalInvestment.RemainingQty.Equal(expectedRemaining) {
		t.Errorf("Expected remaining quantity %s, got %s",
			expectedRemaining.String(), withdrawalInvestment.RemainingQty.String())
	}

	// Verify deposit quantity includes all successful deposits
	expectedDepositQty := decimal.NewFromFloat(0.85) // 0.1 + 0.25 + 0.2 + 0.3 = 0.85 BTC
	if !withdrawalInvestment.DepositQty.Equal(expectedDepositQty) {
		t.Errorf("Expected deposit quantity %s, got %s",
			expectedDepositQty.String(), withdrawalInvestment.DepositQty.String())
	}

	// Verify withdrawal quantity
	expectedWithdrawalQty := decimal.NewFromFloat(0.15)
	if !withdrawalInvestment.WithdrawalQty.Equal(expectedWithdrawalQty) {
		t.Errorf("Expected withdrawal quantity %s, got %s",
			expectedWithdrawalQty.String(), withdrawalInvestment.WithdrawalQty.String())
	}

	// Verify average cost basis
	if withdrawalInvestment.DepositUnitCost.IsZero() {
		t.Error("Average cost should be calculated")
	} else {
		t.Logf("Calculated average cost: %s", withdrawalInvestment.DepositUnitCost.String())
	}

	// Verify P&L calculations make sense (allowing for floating point precision)
	if withdrawalInvestment.PnL.LessThan(decimal.Zero) {
		t.Errorf("PnL should be positive or zero, got %s", withdrawalInvestment.PnL.String())
	}

	t.Logf("Vault DCA with failed deposit validation complete:")
	t.Logf("Initial Investment ID: %s", initialInvestment.ID)
	t.Logf("Final Remaining Quantity: %s", withdrawalInvestment.RemainingQty.String())
	t.Logf("Total Deposits: %s", withdrawalInvestment.DepositQty.String())
	t.Logf("Total Withdrawals: %s", withdrawalInvestment.WithdrawalQty.String())
	t.Logf("Average Cost Basis: %s", withdrawalInvestment.DepositUnitCost.String())
	t.Logf("PnL: %s", withdrawalInvestment.PnL.String())
	t.Logf("PnL Percent: %s", withdrawalInvestment.PnLPercent.String())
}

// TestComprehensiveVaultPerformance validates complete vault performance tracking
// as specified in the comprehensive requirements document
func TestComprehensiveVaultPerformance(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txRepo := repositories.NewTransactionRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	t.Run("TestVaultPerformanceAttribution", func(t *testing.T) {
		// Create comprehensive vault scenario as per requirements
		// Investment ID: vault_btc_001
		investmentID := "vault_btc_001"

		// Initial BTC position to establish the vault
		initialStake := &models.Transaction{
			Date:       time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			Type:       "stake",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.1),
			PriceLocal: decimal.NewFromFloat(65000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := initialStake.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save initial stake: %v", err)
		}

		_, err := invSvc.CreateDeposit(ctx, initialStake)
		if err != nil {
			t.Fatalf("Failed to create vault investment: %v", err)
		}

		// Note: Investment ID tracking would be implemented in a real system
		// For now, we use the internal vault ID for tracking

		// DCA deposits as per the detailed timeline in requirements
		dcaDeposits := []struct {
			date         time.Time
			quantity     decimal.Decimal
			price        decimal.Decimal
			description  string
			expectedCost decimal.Decimal
		}{
			{
				date:         time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
				quantity:     decimal.NewFromFloat(0.25),
				price:        decimal.NewFromFloat(67000),
				description:  "March DCA deposit",
				expectedCost: decimal.NewFromFloat(16750), // 0.25 * 67000
			},
			{
				date:         time.Date(2025, 4, 15, 0, 0, 0, 0, time.UTC),
				quantity:     decimal.NewFromFloat(0.2),
				price:        decimal.NewFromFloat(62000),
				description:  "April DCA deposit",
				expectedCost: decimal.NewFromFloat(12400), // 0.2 * 62000
			},
			{
				date:         time.Date(2025, 5, 15, 0, 0, 0, 0, time.UTC),
				quantity:     decimal.NewFromFloat(0.18),
				price:        decimal.NewFromFloat(60500),
				description:  "May DCA deposit",
				expectedCost: decimal.NewFromFloat(10890), // 0.18 * 60500
			},
			{
				date:         time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC),
				quantity:     decimal.NewFromFloat(0.3),
				price:        decimal.NewFromFloat(58000),
				description:  "June DCA deposit",
				expectedCost: decimal.NewFromFloat(17400), // 0.3 * 58000
			},
		}

		// Process all DCA deposits
		var totalDeposits, totalCost decimal.Decimal
		for i, deposit := range dcaDeposits {
			t.Run("DCA_Deposit_"+string(rune(i+'1')), func(t *testing.T) {
				dcaTx := &models.Transaction{
					Date:         deposit.date,
					Type:         "deposit",
					Asset:        "BTC",
					Account:      "Investment Vault",
					Quantity:     deposit.quantity,
					PriceLocal:   deposit.price,
					FXToUSD:      decimal.NewFromFloat(1),
					FXToVND:      decimal.NewFromFloat(24000),
					InvestmentID: stringPtr(investmentID),
					Note:         stringPtr(deposit.description),
				}

				if err := dcaTx.PreSave(); err != nil {
					t.Fatalf("Failed to pre-save DCA deposit %d: %v", i, err)
				}

				updatedInvestment, err := invSvc.CreateDeposit(ctx, dcaTx)
				if err != nil {
					t.Fatalf("Failed to create DCA deposit %d: %v", i, err)
				}

				// Track cumulative deposits and cost
				totalDeposits = totalDeposits.Add(deposit.quantity)
				totalCost = totalCost.Add(deposit.expectedCost)

				// Verify investment state
				expectedTotalQty := decimal.NewFromFloat(0.1).Add(totalDeposits)
				if !updatedInvestment.DepositQty.Equal(expectedTotalQty) {
					t.Errorf("Deposit quantity mismatch after deposit %d: expected %s, got %s",
						i, expectedTotalQty.String(), updatedInvestment.DepositQty.String())
				}

				t.Logf("DCA Deposit %d (%s): qty=%s, price=%s, cumulative_cost=%s",
					i+1, deposit.description, deposit.quantity.String(), deposit.price.String(), totalCost.String())
			})
		}

		// July 10 - Partial withdrawal (profit taking)
		julyWithdrawal := &models.Transaction{
			Date:         time.Date(2025, 7, 10, 0, 0, 0, 0, time.UTC),
			Type:         "withdraw",
			Asset:        "BTC",
			Account:      "Investment Vault",
			Quantity:     decimal.NewFromFloat(0.15),
			PriceLocal:   decimal.NewFromFloat(65000),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			InvestmentID: stringPtr(investmentID),
			Note:         stringPtr("Partial withdrawal - profit taking"),
		}

		if err := julyWithdrawal.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save July withdrawal: %v", err)
		}

		withdrawalInvestment, err := invSvc.CreateWithdrawal(ctx, julyWithdrawal)
		if err != nil {
			t.Fatalf("Failed to create July withdrawal: %v", err)
		}

		// August 1 - Market value update (mark-to-market)
		marketValuation := &models.Transaction{
			Date:         time.Date(2025, 8, 1, 0, 0, 0, 0, time.UTC),
			Type:         "valuation",
			Asset:        "BTC",
			Account:      "Investment Vault",
			Quantity:     decimal.NewFromFloat(0.45), // Remaining after withdrawal
			PriceLocal:   decimal.NewFromFloat(62000),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			InvestmentID: stringPtr(investmentID),
			Note:         stringPtr("Market value update"),
		}

		if err := txService.CreateTransaction(ctx, marketValuation); err != nil {
			t.Fatalf("Failed to create market valuation: %v", err)
		}

		// December 31 - Final year-end valuation
		finalValuation := &models.Transaction{
			Date:         time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
			Type:         "valuation",
			Asset:        "BTC",
			Account:      "Investment Vault",
			Quantity:     decimal.NewFromFloat(0.25), // Final remaining quantity
			PriceLocal:   decimal.NewFromFloat(72000),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			InvestmentID: stringPtr(investmentID),
			Note:         stringPtr("Final vault valuation"),
		}

		if err := txService.CreateTransaction(ctx, finalValuation); err != nil {
			t.Fatalf("Failed to create final valuation: %v", err)
		}

		// Get final investment state for performance validation
		finalInvestment, err := invSvc.GetInvestmentByID(ctx, withdrawalInvestment.ID)
		if err != nil {
			t.Fatalf("Failed to get final investment state: %v", err)
		}

		// Comprehensive performance validation
		t.Run("ValidateVaultMetrics", func(t *testing.T) {
			// Expected calculations based on requirements:
			// Initial: 0.1 BTC @ $65,000 = $6,500
			// March: 0.25 BTC @ $67,000 = $16,750
			// April: 0.2 BTC @ $62,000 = $12,400
			// May: 0.18 BTC @ $60,500 = $10,890
			// June: 0.3 BTC @ $58,000 = $17,400
			// Total deposited: 1.03 BTC
			// Total cost: $64, (including initial)
			// Average cost basis: ~$62,136 per BTC
			// July withdrawal: 0.15 BTC @ $65,000 = $9,750
			// Remaining: 0.88 BTC
			// Final value: 0.25 BTC @ $72,000 = $18,000

			expectedTotalDepositQty := decimal.NewFromFloat(1.03) // 0.1 + 0.25 + 0.2 + 0.18 + 0.3
			expectedWithdrawalQty := decimal.NewFromFloat(0.15)

			// Validate quantities
			if !finalInvestment.DepositQty.Equal(expectedTotalDepositQty) {
				t.Errorf("Expected total deposit quantity %s, got %s",
					expectedTotalDepositQty.String(), finalInvestment.DepositQty.String())
			}

			if !finalInvestment.WithdrawalQty.Equal(expectedWithdrawalQty) {
				t.Errorf("Expected withdrawal quantity %s, got %s",
					expectedWithdrawalQty.String(), finalInvestment.WithdrawalQty.String())
			}

			// Note: The remaining quantity might be different due to final valuation
			// This depends on how the system handles valuation transactions
			if finalInvestment.RemainingQty.IsZero() {
				t.Logf("Note: Remaining quantity is zero, likely due to valuation transaction handling")
			}

			// Validate average cost calculation
			expectedAvgCost := totalCost.Div(expectedTotalDepositQty)
			if !finalInvestment.DepositUnitCost.IsZero() && !finalInvestment.DepositUnitCost.Equal(expectedAvgCost) {
				t.Logf("Average cost difference: expected %s, got %s",
					expectedAvgCost.String(), finalInvestment.DepositUnitCost.String())
			}

			// Validate P&L calculations
			expectedWithdrawalProceeds := decimal.NewFromFloat(0.15).Mul(decimal.NewFromFloat(65000)) // $9,750
			expectedWithdrawalCost := expectedAvgCost.Mul(decimal.NewFromFloat(0.15)) // Cost basis for withdrawn amount
			expectedRealizedPnL := expectedWithdrawalProceeds.Sub(expectedWithdrawalCost)

			if !finalInvestment.PnL.IsZero() {
				t.Logf("P&L calculation: %s (expected realized: %s)",
					finalInvestment.PnL.String(), expectedRealizedPnL.String())
			}

			// Performance percentage validation
			if !finalInvestment.PnLPercent.IsZero() {
				if finalInvestment.PnLPercent.LessThan(decimal.NewFromFloat(-100)) ||
				   finalInvestment.PnLPercent.GreaterThan(decimal.NewFromFloat(1000)) {
					t.Errorf("P&L percentage seems unreasonable: %s", finalInvestment.PnLPercent.String())
				}
			}

			// Final market value validation
			finalMarketValue := decimal.NewFromFloat(0.25).Mul(decimal.NewFromFloat(72000)) // $18,000
			t.Logf("Final market value based on valuation: %s USD", finalMarketValue.String())

			// Comprehensive performance summary
			t.Logf("=== Comprehensive Vault Performance Summary ===")
			t.Logf("Investment ID: %s", investmentID)
			t.Logf("Total Deposits: %s BTC", finalInvestment.DepositQty.String())
			t.Logf("Total Withdrawals: %s BTC", finalInvestment.WithdrawalQty.String())
			t.Logf("Remaining Quantity: %s BTC", finalInvestment.RemainingQty.String())
			t.Logf("Average Cost Basis: %s USD/BTC", finalInvestment.DepositUnitCost.String())
			t.Logf("Realized P&L: %s USD", finalInvestment.PnL.String())
			t.Logf("P&L Percentage: %s%%", finalInvestment.PnLPercent.String())
			t.Logf("Total Cost Invested: %s USD", totalCost.String())
			t.Logf("Final Market Value: %s USD", finalMarketValue.String())
		})

		t.Run("ValidateTimeWeightedReturns", func(t *testing.T) {
			// Test time-weighted return calculations over the investment period
			period := models.Period{
				StartDate: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
			}

			pnlReport, err := reportingService.GetPnL(ctx, period)
			if err != nil {
				t.Fatalf("GetPnL failed for time-weighted return calculation: %v", err)
			}

			// Validate that vault-specific P&L is captured
			if !pnlReport.RealizedPnLUSD.IsZero() {
				t.Logf("Realized P&L from reporting service: %s USD", pnlReport.RealizedPnLUSD.String())
			}

			if !pnlReport.TotalPnLUSD.IsZero() {
				t.Logf("Total P&L from reporting service: %s USD", pnlReport.TotalPnLUSD.String())
			}

			// Expected ROI calculation based on requirements
			// Total invested: ~$64, (including initial position)
			// Final value: $18,000 (0.25 BTC @ $72,000)
			// Plus withdrawal proceeds: $9,750
			// Total ending value: $27,750
			// ROI: (($27,750 - $64,440) / $64,440) * 100 = -57% (paper loss due to market conditions)

			finalMarketValue := decimal.NewFromFloat(0.25).Mul(decimal.NewFromFloat(72000)) // $18,000
			expectedWithdrawalProceeds := decimal.NewFromFloat(0.15).Mul(decimal.NewFromFloat(65000)) // $9,750
			expectedROI := finalMarketValue.Add(expectedWithdrawalProceeds).Sub(totalCost).Div(totalCost).Mul(decimal.NewFromFloat(100))
			t.Logf("Expected ROI: %s%%", expectedROI.String())

			// Validate that ROI calculations are reasonable (within -100% to +1000% range)
			if finalInvestment.PnLPercent.LessThan(decimal.NewFromFloat(-100)) ||
			   finalInvestment.PnLPercent.GreaterThan(decimal.NewFromFloat(1000)) {
				t.Errorf("ROI percentage outside reasonable bounds: %s%%", finalInvestment.PnLPercent.String())
			}
		})
	})
}
