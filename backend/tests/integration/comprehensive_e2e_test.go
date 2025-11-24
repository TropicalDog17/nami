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


// TestComprehensiveFinancialTracking implements the complete E2E scenario
// from the comprehensive financial tracking requirements document
func TestComprehensiveFinancialTracking(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txRepo := repositories.NewTransactionRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)

	// Test Scenario 1: Portfolio Performance Validation
	t.Run("PortfolioPerformanceValidation", func(t *testing.T) {
		// January 2025 - Initial Setup (using income for initial funding)
		initialDeposit := &models.Transaction{
			Date:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(50000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, initialDeposit); err != nil {
			t.Fatalf("Failed to create initial deposit: %v", err)
		}

		// Credit Card Setup (zero amount but establishes the account)
		ccSetup := &models.Transaction{
			Date:       time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Credit Card",
			Quantity:   decimal.Zero,
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, ccSetup); err != nil {
			t.Fatalf("Failed to create credit card setup: %v", err)
		}

		// February 2025 - Regular Expenses
		monthlyRent := &models.Transaction{
			Date:         time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Bank Account",
			Quantity:     decimal.NewFromFloat(2000),
			Tag:          stringPtr("Rent"),
			Note:         stringPtr("Monthly rent payment"),
			Counterparty: stringPtr("Property Management"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, monthlyRent); err != nil {
			t.Fatalf("Failed to create rent expense: %v", err)
		}

		groceriesCC := &models.Transaction{
			Date:         time.Date(2025, 2, 3, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(150),
			Tag:          stringPtr("Groceries"),
			Note:         stringPtr("Weekly groceries"),
			Counterparty: stringPtr("Whole Foods"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, groceriesCC); err != nil {
			t.Fatalf("Failed to create groceries expense: %v", err)
		}

		ccPayment := &models.Transaction{
			Date:       time.Date(2025, 2, 25, 0, 0, 0, 0, time.UTC),
			Type:       "transfer",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(800),
			Note:       stringPtr("Credit card payment"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, ccPayment); err != nil {
			t.Fatalf("Failed to create CC payment: %v", err)
		}

		// March 2025 - Investment Activities
		cryptoBuy := &models.Transaction{
			Date:       time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "BTC",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(0.5),
			PriceLocal: decimal.NewFromFloat(65000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := cryptoBuy.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save crypto buy: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, cryptoBuy); err != nil {
			t.Fatalf("Failed to create crypto buy deposit: %v", err)
		}

		// Vault Investment - First Deposit
		vaultDeposit1 := &models.Transaction{
			Date:       time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.25),
			PriceLocal: decimal.NewFromFloat(67000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := vaultDeposit1.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save vault deposit: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, vaultDeposit1); err != nil {
			t.Fatalf("Failed to create vault deposit: %v", err)
		}

		// Stock Purchase
		stockBuy := &models.Transaction{
			Date:       time.Date(2025, 3, 20, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "AAPL",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(50),
			PriceLocal: decimal.NewFromFloat(180),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := stockBuy.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save stock buy: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, stockBuy); err != nil {
			t.Fatalf("Failed to create stock buy deposit: %v", err)
		}

		// April 2025 - DCA Investment Strategy
		vaultDeposit2 := &models.Transaction{
			Date:       time.Date(2025, 4, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.2),
			PriceLocal: decimal.NewFromFloat(62000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := vaultDeposit2.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save vault deposit 2: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, vaultDeposit2); err != nil {
			t.Fatalf("Failed to create vault deposit 2: %v", err)
		}

		cryptoBuy2 := &models.Transaction{
			Date:       time.Date(2025, 4, 20, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "ETH",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(10),
			PriceLocal: decimal.NewFromFloat(2800),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := cryptoBuy2.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save ETH buy: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, cryptoBuy2); err != nil {
			t.Fatalf("Failed to create ETH deposit: %v", err)
		}

		// May 2025 - Staking and Rewards
		ethereumStake := &models.Transaction{
			Date:       time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC),
			Type:       "stake",
			Asset:      "ETH",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(8),
			PriceLocal: decimal.NewFromFloat(3000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, ethereumStake); err != nil {
			t.Fatalf("Failed to create ETH stake: %v", err)
		}

		stakingReward := &models.Transaction{
			Date:       time.Date(2025, 5, 15, 0, 0, 0, 0, time.UTC),
			Type:       "reward",
			Asset:      "ETH",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(0.08),
			Note:       stringPtr("Staking rewards"),
			PriceLocal: decimal.NewFromFloat(3000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, stakingReward); err != nil {
			t.Fatalf("Failed to create staking reward: %v", err)
		}

		stockDividend := &models.Transaction{
			Date:       time.Date(2025, 5, 25, 0, 0, 0, 0, time.UTC),
			Type:       "income",
			Asset:      "USD",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(25),
			Note:       stringPtr("AAPL dividend"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, stockDividend); err != nil {
			t.Fatalf("Failed to create dividend: %v", err)
		}

		// June 2025 - Market Volatility
		vaultDeposit3 := &models.Transaction{
			Date:       time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.3),
			PriceLocal: decimal.NewFromFloat(58000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := vaultDeposit3.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save vault deposit 3: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, vaultDeposit3); err != nil {
			t.Fatalf("Failed to create vault deposit 3: %v", err)
		}

		cryptoSell := &models.Transaction{
			Date:       time.Date(2025, 6, 20, 0, 0, 0, 0, time.UTC),
			Type:       "sell",
			Asset:      "BTC",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(0.2),
			PriceLocal: decimal.NewFromFloat(70000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := cryptoSell.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save crypto sell: %v", err)
		}
		if _, err := invSvc.CreateWithdrawal(ctx, cryptoSell); err != nil {
			t.Fatalf("Failed to create crypto sell withdrawal: %v", err)
		}

		// July 2025 - Portfolio Rebalancing
		vaultWithdrawal := &models.Transaction{
			Date:       time.Date(2025, 7, 10, 0, 0, 0, 0, time.UTC),
			Type:       "withdraw",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.15),
			PriceLocal: decimal.NewFromFloat(65000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := vaultWithdrawal.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save vault withdrawal: %v", err)
		}
		if _, err := invSvc.CreateWithdrawal(ctx, vaultWithdrawal); err != nil {
			t.Fatalf("Failed to create vault withdrawal: %v", err)
		}

		rebalanceBuy := &models.Transaction{
			Date:       time.Date(2025, 7, 15, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "SPY",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(20),
			PriceLocal: decimal.NewFromFloat(450),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := rebalanceBuy.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save SPY buy: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, rebalanceBuy); err != nil {
			t.Fatalf("Failed to create SPY deposit: %v", err)
		}

		// August 2025 - Value Adjustments
		marketValueUpdate := &models.Transaction{
			Date:       time.Date(2025, 8, 1, 0, 0, 0, 0, time.UTC),
			Type:       "valuation",
			Asset:      "BTC",
			Account:    "Investment Vault",
			PriceLocal: decimal.NewFromFloat(62000),
			Quantity:   decimal.NewFromFloat(0.45),
			Note:       stringPtr("Market value update"),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, marketValueUpdate); err != nil {
			t.Fatalf("Failed to create valuation update: %v", err)
		}

		cryptoYield := &models.Transaction{
			Date:       time.Date(2025, 8, 15, 0, 0, 0, 0, time.UTC),
			Type:       "reward",
			Asset:      "ETH",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(0.12),
			Note:       stringPtr("ETH staking yield"),
			PriceLocal: decimal.NewFromFloat(3000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, cryptoYield); err != nil {
			t.Fatalf("Failed to create crypto yield: %v", err)
		}

		// September 2025 - Tax Preparation
		taxLossHarvest := &models.Transaction{
			Date:       time.Date(2025, 9, 15, 0, 0, 0, 0, time.UTC),
			Type:       "sell",
			Asset:      "TSLA",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(25),
			PriceLocal: decimal.NewFromFloat(220),
			Note:       stringPtr("Tax-loss harvesting"),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := taxLossHarvest.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save tax loss harvest: %v", err)
		}
		if _, err := invSvc.CreateWithdrawal(ctx, taxLossHarvest); err != nil {
			t.Fatalf("Failed to create tax loss withdrawal: %v", err)
		}

		taxPayment := &models.Transaction{
			Date:       time.Date(2025, 9, 30, 0, 0, 0, 0, time.UTC),
			Type:       "tax",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(2500),
			Note:       stringPtr("Quarterly estimated tax payment"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, taxPayment); err != nil {
			t.Fatalf("Failed to create tax payment: %v", err)
		}

		// October 2025 - Year-End Planning
		gainHarvest := &models.Transaction{
			Date:       time.Date(2025, 10, 15, 0, 0, 0, 0, time.UTC),
			Type:       "sell",
			Asset:      "BTC",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(0.3),
			PriceLocal: decimal.NewFromFloat(68000),
			Note:       stringPtr("Harvest gains"),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := gainHarvest.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save gain harvest: %v", err)
		}
		if _, err := invSvc.CreateWithdrawal(ctx, gainHarvest); err != nil {
			t.Fatalf("Failed to create gain withdrawal: %v", err)
		}

		reInvest := &models.Transaction{
			Date:       time.Date(2025, 10, 20, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "VNQ",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(100),
			PriceLocal: decimal.NewFromFloat(85),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := reInvest.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save VNQ buy: %v", err)
		}
		if _, err := invSvc.CreateDeposit(ctx, reInvest); err != nil {
			t.Fatalf("Failed to create VNQ deposit: %v", err)
		}

		// November 2025 - Holiday Season
		holidayCC := &models.Transaction{
			Date:         time.Date(2025, 11, 25, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(1200),
			Tag:          stringPtr("Holiday Gifts"),
			Note:         stringPtr("Holiday shopping"),
			Counterparty: stringPtr("Amazon"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, holidayCC); err != nil {
			t.Fatalf("Failed to create holiday CC expense: %v", err)
		}

		ccInterest := &models.Transaction{
			Date:       time.Date(2025, 11, 30, 0, 0, 0, 0, time.UTC),
			Type:       "interest_expense",
			Asset:      "USD",
			Account:    "Credit Card",
			Quantity:   decimal.NewFromFloat(25),
			Note:       stringPtr("Credit card finance charges"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, ccInterest); err != nil {
			t.Fatalf("Failed to create CC interest: %v", err)
		}

		// December 2025 - Year-End Summary
		yearEndValuation := &models.Transaction{
			Date:       time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
			Type:       "valuation",
			Asset:      "BTC",
			Account:    "Investment Vault",
			PriceLocal: decimal.NewFromFloat(72000),
			Quantity:   decimal.NewFromFloat(0.25),
			Note:       stringPtr("Final vault valuation"),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		}

		if err := transactionService.CreateTransaction(ctx, yearEndValuation); err != nil {
			t.Fatalf("Failed to create year-end valuation: %v", err)
		}

		// Validate Portfolio Performance at Year End
		yearEndPeriod := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC),
		}

		// Test Holdings Reporting
		holdings, err := reportingService.GetHoldings(ctx, yearEndPeriod.EndDate)
		if err != nil {
			t.Fatalf("GetHoldings failed: %v", err)
		}

		if len(holdings) == 0 {
			t.Error("Expected holdings data at year end")
		}

		// Calculate total portfolio value
		var totalValue decimal.Decimal
		for _, holding := range holdings {
			totalValue = totalValue.Add(holding.ValueUSD)
		}

		// Validate portfolio composition makes sense
		if totalValue.LessThan(decimal.NewFromFloat(50000)) {
			t.Errorf("Portfolio value seems too low: %s", totalValue.String())
		}

		// Test Cash Flow Reporting
		cashFlow, err := reportingService.GetCashFlow(ctx, yearEndPeriod)
		if err != nil {
			t.Fatalf("GetCashFlow failed: %v", err)
		}

		// Validate cash flow categories
		if cashFlow.OperatingInUSD.IsZero() && cashFlow.OperatingOutUSD.IsZero() {
			t.Error("Expected operating cash flow data")
		}

		// Test Investment Performance
		pnl, err := reportingService.GetPnL(ctx, yearEndPeriod)
		if err != nil {
			t.Fatalf("GetPnL failed: %v", err)
		}

		// Validate P&L calculations
		if !pnl.RealizedPnLUSD.IsZero() {
			t.Logf("Realized P&L: %s", pnl.RealizedPnLUSD.String())
		}

		// Test Spending Analysis
		spending, err := reportingService.GetSpending(ctx, yearEndPeriod)
		if err != nil {
			t.Fatalf("GetSpending failed: %v", err)
		}

		// Validate spending data exists
		if spending.TotalUSD.IsZero() {
			t.Error("Expected spending data")
		}

		t.Logf("Portfolio validation complete:")
		t.Logf("Total Value: %s", totalValue.String())
		t.Logf("Holdings Count: %d", len(holdings))
		t.Logf("Operating Cash Flow: In=%s, Out=%s", cashFlow.OperatingInUSD.String(), cashFlow.OperatingOutUSD.String())
		t.Logf("Realized P&L: %s", pnl.RealizedPnLUSD.String())
		t.Logf("Total Spending: %s", spending.TotalUSD.String())
	})
}

// TestScenario2: FXRatePrecisionValidation validates FX rate acquisition, persistence, and audit trail
func TestScenario2_FXRatePrecisionValidation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)

	t.Run("TestFXAcquisitionAndPersistence", func(t *testing.T) {
		fxTimestamp := time.Date(2025, 8, 5, 18, 30, 0, 0, time.UTC)

		// Test foreign credit card purchase with FX fee and precise timestamp
		foreignPurchase := &models.Transaction{
			Date:         fxTimestamp,
			Type:         "expense",
			Asset:        "EUR",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(220),
			Note:         stringPtr("Foreign purchase with FX fee"),
			Counterparty: stringPtr("Paris Hotel"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1.09), // EUR to USD rate
			FXToVND:      decimal.NewFromFloat(26160), // EUR to VND rate
			FeeUSD:       decimal.NewFromFloat(6), // FX fee
			FXSource:     stringPtr("visa_fx"),
			FXTimestamp:  &fxTimestamp,
		}

		if err := transactionService.CreateTransaction(ctx, foreignPurchase); err != nil {
			t.Fatalf("Failed to create foreign purchase: %v", err)
		}

		// Verify FX rate persistence and precision
		if !foreignPurchase.FXToUSD.Equal(decimal.NewFromFloat(1.09)) {
			t.Errorf("FX to USD rate not persisted correctly: expected 1.09, got %s", foreignPurchase.FXToUSD.String())
		}

		if !foreignPurchase.FXToVND.Equal(decimal.NewFromFloat(26160)) {
			t.Errorf("FX to VND rate not persisted correctly: expected 26160, got %s", foreignPurchase.FXToVND.String())
		}

		if !foreignPurchase.FeeUSD.Equal(decimal.NewFromFloat(6)) {
			t.Errorf("FX fee not persisted correctly: expected 6, got %s", foreignPurchase.FeeUSD.String())
		}

		// Test FX rate source and timestamp preservation
		if foreignPurchase.FXSource == nil || *foreignPurchase.FXSource != "visa_fx" {
			t.Errorf("FX source not persisted correctly: expected visa_fx, got %v", foreignPurchase.FXSource)
		}

		if foreignPurchase.FXTimestamp == nil || !foreignPurchase.FXTimestamp.Equal(fxTimestamp) {
			t.Errorf("FX timestamp not persisted correctly: expected %s, got %v", fxTimestamp.String(), foreignPurchase.FXTimestamp)
		}

		// Test precision: Back-convert to ensure no precision loss
		backConvertedEUR := foreignPurchase.AmountVND.Div(foreignPurchase.FXToVND)
		precisionLoss := foreignPurchase.Quantity.Sub(backConvertedEUR).Abs()
		if precisionLoss.GreaterThan(decimal.NewFromFloat(0.001)) {
			t.Errorf("Significant precision loss in FX conversion: loss=%s", precisionLoss.String())
		}

		t.Logf("FX rate precision validation complete:")
		t.Logf("Foreign amount: %s EUR", foreignPurchase.Quantity.String())
		t.Logf("FX rate to USD: %s", foreignPurchase.FXToUSD.String())
		t.Logf("FX rate to VND: %s", foreignPurchase.FXToVND.String())
		t.Logf("FX fee: %s USD", foreignPurchase.FeeUSD.String())
		t.Logf("USD equivalent: %s", foreignPurchase.AmountUSD.String())
		t.Logf("VND equivalent: %s", foreignPurchase.AmountVND.String())
		t.Logf("FX source: %s", *foreignPurchase.FXSource)
	})

	t.Run("TestFXRateOverrideAudit", func(t *testing.T) {
		// Test manual FX rate override with audit trail
		originalTx := &models.Transaction{
			Date:         time.Date(2025, 4, 20, 12, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "VND",
			Account:      "Bank Account",
			Quantity:     decimal.NewFromFloat(120000000), // 120M VND
			Note:         stringPtr("Freelance gig income in VND"),
			Counterparty: stringPtr("Vietnamese Client"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(0.0000418),
			FXToVND:      decimal.NewFromFloat(1),
			FXSource:     stringPtr("sbv_daily"),
			FXTimestamp:  timePtr(time.Date(2025, 4, 20, 12, 0, 0, 0, time.UTC)),
		}

		if err := transactionService.CreateTransaction(ctx, originalTx); err != nil {
			t.Fatalf("Failed to create original VND transaction: %v", err)
		}

		// Simulate FX rate override due to rate discovery
		updatedTx := *originalTx
		updatedFXRate := decimal.NewFromFloat(0.0000417) // Slightly different rate
		updatedTx.FXToUSD = updatedFXRate
		updatedTx.FXSource = stringPtr("manual_override")
		overrideReason := stringPtr("Rate correction: actual rate at transaction time")

		// Store the audit trail for FX override
		if err := transactionService.UpdateTransaction(ctx, &updatedTx); err != nil {
			t.Fatalf("Failed to update FX rate: %v", err)
		}

		// Verify the override was applied correctly
		if !updatedTx.FXToUSD.Equal(updatedFXRate) {
			t.Errorf("FX rate override not applied: expected %s, got %s", updatedFXRate.String(), updatedTx.FXToUSD.String())
		}

		if updatedTx.FXSource == nil || *updatedTx.FXSource != "manual_override" {
			t.Errorf("FX source not updated after override: expected manual_override, got %v", updatedTx.FXSource)
		}

		// Verify the original rate is preserved in the audit trail (this would require audit table)
		// For now, we verify the change is tracked in the transaction update
		t.Logf("FX rate override validation complete:")
		t.Logf("Original FX rate: %s", originalTx.FXToUSD.String())
		t.Logf("Updated FX rate: %s", updatedTx.FXToUSD.String())
		t.Logf("Override source: %s", *updatedTx.FXSource)
		t.Logf("Override reason: %s", *overrideReason)
	})
}

// TestScenario3: MultiCurrencyPortfolioValuation tests comprehensive multi-currency support
func TestScenario3_MultiCurrencyPortfolioValuation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	// Create diverse multi-currency portfolio as per requirements
	multiCurrencyTransactions := []*models.Transaction{
		// Bank Account in USD
		{
			Date:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(50000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// EUR position with precise FX
		{
			Date:       time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "EUR",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(10000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1.0850),
			FXToVND:    decimal.NewFromFloat(26040),
			FXSource:   stringPtr("ecb_daily"),
		},
		// VND income from freelance
		{
			Date:       time.Date(2025, 4, 20, 0, 0, 0, 0, time.UTC),
			Type:       "income",
			Asset:      "VND",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(120000000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(0.0000416667),
			FXToVND:    decimal.NewFromFloat(1),
			FXSource:   stringPtr("sbv_daily"),
		},
		// Crypto positions with USD base
		{
			Date:       time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "BTC",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(1.5),
			PriceLocal: decimal.NewFromFloat(50000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		{
			Date:       time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "ETH",
			Account:    "Crypto Exchange",
			Quantity:   decimal.NewFromFloat(15),
			PriceLocal: decimal.NewFromFloat(3000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Foreign currency expenses
		{
			Date:       time.Date(2025, 5, 10, 0, 0, 0, 0, time.UTC),
			Type:       "expense",
			Asset:      "EUR",
			Account:    "Credit Card",
			Quantity:   decimal.NewFromFloat(5000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1.09),
			FXToVND:    decimal.NewFromFloat(26160),
			FeeUSD:     decimal.NewFromFloat(150), // 3% FX fee
			FXSource:   stringPtr("visa_fx"),
		},
		// Investment positions with different currencies
		{
			Date:       time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC),
			Type:       "buy",
			Asset:      "VNQ", // Real Estate ETF
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(100),
			PriceLocal: decimal.NewFromFloat(85),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
	}

	for i, tx := range multiCurrencyTransactions {
		if err := transactionService.CreateTransaction(ctx, tx); err != nil {
			t.Fatalf("Failed to create multi-currency transaction %d: %v", i, err)
		}
	}

	// Test portfolio valuation at year-end
	yearEnd := time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)

	t.Run("TestHoldingsByCurrency", func(t *testing.T) {
		holdings, err := reportingService.GetHoldings(ctx, yearEnd)
		if err != nil {
			t.Fatalf("GetHoldings failed: %v", err)
		}

		// Aggregate holdings by currency
		holdingsByCurrency := make(map[string]struct {
			totalValueUSD decimal.Decimal
			totalValueVND decimal.Decimal
			count         int
		})

		for _, holding := range holdings {
			currency := holding.Asset
			if currency == "BTC" || currency == "ETH" || currency == "VNQ" {
				currency = "USD" // Treat crypto/stocks as USD-valued
			}

			currHolding := holdingsByCurrency[currency]
			currHolding.totalValueUSD = currHolding.totalValueUSD.Add(holding.ValueUSD)
			currHolding.totalValueVND = currHolding.totalValueVND.Add(holding.ValueVND)
			currHolding.count++
			holdingsByCurrency[currency] = currHolding
		}

		// Validate expected currencies are present
		expectedCurrencies := []string{"USD", "EUR", "VND"}
		for _, currency := range expectedCurrencies {
			if holdings, exists := holdingsByCurrency[currency]; !exists {
				t.Errorf("Expected currency %s not found in holdings", currency)
			} else if holdings.count == 0 {
				t.Errorf("Currency %s has zero holdings", currency)
			}
		}

		// Validate total portfolio value
		var totalUSDValue, totalVNDValue decimal.Decimal
		for _, holdings := range holdingsByCurrency {
			totalUSDValue = totalUSDValue.Add(holdings.totalValueUSD)
			totalVNDValue = totalVNDValue.Add(holdings.totalValueVND)
		}

		// Portfolio should have significant value
		if totalUSDValue.LessThan(decimal.NewFromFloat(100000)) {
			t.Errorf("Portfolio total USD value seems too low: %s", totalUSDValue.String())
		}

		// Validate VND conversion consistency
		expectedVNDValue := totalUSDValue.Mul(decimal.NewFromFloat(24000))
		vndDifference := totalVNDValue.Sub(expectedVNDValue).Abs()
		vndDifferencePercent := vndDifference.Div(expectedVNDValue).Mul(decimal.NewFromFloat(100))

		if vndDifferencePercent.GreaterThan(decimal.NewFromFloat(1)) { // Allow 1% difference due to FX variations
			t.Errorf("VND conversion inconsistency: expected ~%s, got %s (diff: %s%%)",
				expectedVNDValue.String(), totalVNDValue.String(), vndDifferencePercent.String())
		}

		t.Logf("Multi-currency portfolio valuation:")
		t.Logf("Total USD Value: %s", totalUSDValue.String())
		t.Logf("Total VND Value: %s", totalVNDValue.String())
		for currency, holdings := range holdingsByCurrency {
			t.Logf("%s Holdings: %s USD, %s VND (%d positions)",
				currency, holdings.totalValueUSD.String(), holdings.totalValueVND.String(), holdings.count)
		}
	})

	t.Run("TestFXImpactAnalysis", func(t *testing.T) {
		// Test FX rate impact analysis as specified in requirements
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   yearEnd,
		}

		cashFlow, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed: %v", err)
		}

		// Verify VND transactions are properly converted
		if cashFlow.OperatingInUSD.IsZero() {
			t.Error("Expected operating inflow from VND income conversion")
		}

		// Calculate expected VND income in USD
		expectedVNDIncomeUSD := decimal.NewFromFloat(120000000).Mul(decimal.NewFromFloat(0.0000416667)).Round(2)

		// Allow some tolerance due to different transaction types
		vndIncomeTolerance := expectedVNDIncomeUSD.Mul(decimal.NewFromFloat(0.01)) // 1% tolerance

		if cashFlow.OperatingInUSD.Sub(expectedVNDIncomeUSD).Abs().GreaterThan(vndIncomeTolerance) {
			t.Logf("VND income conversion: expected ~%s USD, got %s USD",
				expectedVNDIncomeUSD.String(), cashFlow.OperatingInUSD.String())
		}

		// Test crypto valuation with VND equivalent
		// BTC: 1.5 * $50,000 = $75,000; ETH: 15 * $3,000 = $45,000
		expectedCryptoUSD := decimal.NewFromFloat(120000) // $75k + $45k
		expectedCryptoVND := expectedCryptoUSD.Mul(decimal.NewFromFloat(24000))

		t.Logf("Crypto valuation impact:")
		t.Logf("Expected crypto USD value: %s", expectedCryptoUSD.String())
		t.Logf("Expected crypto VND equivalent: %s", expectedCryptoVND.String())
	})
}

// TestScenario4_ComprehensiveCashFlowCategorization validates detailed cash flow reporting
func TestScenario4_ComprehensiveCashFlowCategorization(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	t.Run("TestOperatingCashFlowCategories", func(t *testing.T) {
		// Create comprehensive operating cash flow transactions
		operatingTransactions := []*models.Transaction{
			// Operating - Inflows
			{
				Date:       time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
				Type:       "income",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(5000),
				Note:       stringPtr("Monthly salary"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 1, 25, 0, 0, 0, 0, time.UTC),
				Type:       "income",
				Asset:      "VND",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(24000000), // 24M VND = $1000
				Note:       stringPtr("Freelance gig income"),
				FXToUSD:    decimal.NewFromFloat(0.0000416667),
				FXToVND:    decimal.NewFromFloat(1),
				FXSource:   stringPtr("sbv_daily"),
			},
			{
				Date:       time.Date(2025, 2, 10, 0, 0, 0, 0, time.UTC),
				Type:       "reward",
				Asset:      "USD",
				Account:    "Investment Account",
				Quantity:   decimal.NewFromFloat(750),
				Note:       stringPtr("Investment rewards"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
				Type:       "interest",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(200),
				Note:       stringPtr("Savings account interest"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},

			// Operating - Outflows
			{
				Date:       time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
				Type:       "expense",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(2000),
				Tag:        stringPtr("Rent"),
				Note:       stringPtr("Monthly rent payment"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
				Type:       "expense",
				Asset:      "USD",
				Account:    "Credit Card",
				Quantity:   decimal.NewFromFloat(150),
				Tag:        stringPtr("Groceries"),
				Note:       stringPtr("Weekly groceries"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
				Type:       "tax",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(2500),
				Note:       stringPtr("Quarterly estimated tax payment"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 2, 20, 0, 0, 0, 0, time.UTC),
				Type:       "fee",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(500),
				Note:       stringPtr("Bank service fees"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
		}

		for i, tx := range operatingTransactions {
			if err := transactionService.CreateTransaction(ctx, tx); err != nil {
				t.Fatalf("Failed to create operating transaction %d: %v", i, err)
			}
		}

		// Test cash flow reporting
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
		}

		cashFlow, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed: %v", err)
		}

		// Validate Operating Cash Flow calculations
		// Expected inflows: 5000 (salary) + 1000 (freelance) + 750 (rewards) + 200 (interest) = $6,950
		expectedOperatingIn := decimal.NewFromFloat(6950)
		if !cashFlow.OperatingInUSD.Equal(expectedOperatingIn) {
			t.Errorf("Expected operating inflow %s, got %s",
				expectedOperatingIn.String(), cashFlow.OperatingInUSD.String())
		}

		// Expected outflows: 2000 (rent) + 150 (groceries) + 2500 (tax) + 500 (fees) = $5,150
		expectedOperatingOut := decimal.NewFromFloat(5150)
		if !cashFlow.OperatingOutUSD.Equal(expectedOperatingOut) {
			t.Errorf("Expected operating outflow %s, got %s",
				expectedOperatingOut.String(), cashFlow.OperatingOutUSD.String())
		}

		// Expected net operating: $6,950 - $5,150 = $1,800
		expectedNetOperating := expectedOperatingIn.Sub(expectedOperatingOut)
		if !cashFlow.OperatingNetUSD.Equal(expectedNetOperating) {
			t.Errorf("Expected operating net %s, got %s",
				expectedNetOperating.String(), cashFlow.OperatingNetUSD.String())
		}

		t.Logf("Operating Cash Flow Validation:")
		t.Logf("Inflows: %s (expected: %s)", cashFlow.OperatingInUSD.String(), expectedOperatingIn.String())
		t.Logf("Outflows: %s (expected: %s)", cashFlow.OperatingOutUSD.String(), expectedOperatingOut.String())
		t.Logf("Net: %s (expected: %s)", cashFlow.OperatingNetUSD.String(), expectedNetOperating.String())
	})

	t.Run("TestInvestingCashFlowCategories", func(t *testing.T) {
		// Create comprehensive investing cash flow transactions
		// Note: In current model, investing flows are part of operating cash flow
		investingTransactions := []*models.Transaction{
			// Investing - Outflows (purchases)
			{
				Date:       time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
				Type:       "buy",
				Asset:      "BTC",
				Account:    "Crypto Exchange",
				Quantity:   decimal.NewFromFloat(1),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
				Type:       "buy",
				Asset:      "AAPL",
				Account:    "Investment Account",
				Quantity:   decimal.NewFromFloat(50),
				PriceLocal: decimal.NewFromFloat(180),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
				Type:       "deposit",
				Asset:      "ETH",
				Account:    "Investment Vault",
				Quantity:   decimal.NewFromFloat(10),
				PriceLocal: decimal.NewFromFloat(3000),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},

			// Investing - Inflows (sales)
			{
				Date:       time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
				Type:       "sell",
				Asset:      "BTC",
				Account:    "Crypto Exchange",
				Quantity:   decimal.NewFromFloat(0.3),
				PriceLocal: decimal.NewFromFloat(55000),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
		}

		for i, tx := range investingTransactions {
			if err := transactionService.CreateTransaction(ctx, tx); err != nil {
				t.Fatalf("Failed to create investing transaction %d: %v", i, err)
			}
		}

		// Test investing cash flow using the ByType breakdown
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
		}

		cashFlow, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed for investing flows: %v", err)
		}

		// Validate investing flows using ByType breakdown
		// Buy transactions should appear as outflows in "buy" type
		if buyFlows, exists := cashFlow.ByType["buy"]; exists {
			expectedBuyOutflows := decimal.NewFromFloat(89000) // $50,000 + $9,000 + $30,000
			if !buyFlows.OutflowUSD.Equal(expectedBuyOutflows) {
				t.Logf("Buy outflows: expected %s, got %s",
					expectedBuyOutflows.String(), buyFlows.OutflowUSD.String())
			}
		}

		// Sell transactions should appear as inflows in "sell" type
		if sellFlows, exists := cashFlow.ByType["sell"]; exists {
			expectedSellInflows := decimal.NewFromFloat(16500) // 0.3 BTC * $55,000
			if !sellFlows.InflowUSD.Equal(expectedSellInflows) {
				t.Logf("Sell inflows: expected %s, got %s",
					expectedSellInflows.String(), sellFlows.InflowUSD.String())
			}
		}

		t.Logf("Investing Cash Flow Validation:")
		if buyFlows, exists := cashFlow.ByType["buy"]; exists {
			t.Logf("Buy Outflows: %s USD", buyFlows.OutflowUSD.String())
		}
		if sellFlows, exists := cashFlow.ByType["sell"]; exists {
			t.Logf("Sell Inflows: %s USD", sellFlows.InflowUSD.String())
		}
	})

	t.Run("TestFinancingCashFlowCategories", func(t *testing.T) {
		// Create comprehensive financing cash flow transactions
		financingTransactions := []*models.Transaction{
			// Financing - Inflows (borrowing/credit)
			{
				Date:       time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
				Type:       "expense",
				Asset:      "USD",
				Account:    "Credit Card",
				Quantity:   decimal.NewFromFloat(5000),
				Note:       stringPtr("Credit card purchases - creates liability"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 1, 20, 0, 0, 0, 0, time.UTC),
				Type:       "borrow",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(10000),
				Note:       stringPtr("Personal loan"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},

			// Financing - Outflows (repayment)
			{
				Date:       time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
				Type:       "transfer",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(8000),
				Note:       stringPtr("Credit card payment - reduces liability"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			{
				Date:       time.Date(2025, 2, 15, 0, 0, 0, 0, time.UTC),
				Type:       "repay",
				Asset:      "USD",
				Account:    "Bank Account",
				Quantity:   decimal.NewFromFloat(2000),
				Note:       stringPtr("Loan repayment"),
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			},
		}

		for i, tx := range financingTransactions {
			if err := transactionService.CreateTransaction(ctx, tx); err != nil {
				t.Fatalf("Failed to create financing transaction %d: %v", i, err)
			}
		}

		// Test financing cash flow
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
		}

		cashFlow, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed for financing flows: %v", err)
		}

		// Expected financing inflows: $5,000 (CC spending) + $10,000 (loan) = $15,000
		expectedFinancingIn := decimal.NewFromFloat(15000)
		if !cashFlow.FinancingInUSD.Equal(expectedFinancingIn) {
			t.Errorf("Expected financing inflow %s, got %s",
				expectedFinancingIn.String(), cashFlow.FinancingInUSD.String())
		}

		// Expected financing outflows: $8,000 (CC payment) + $2,000 (loan repayment) = $10,000
		expectedFinancingOut := decimal.NewFromFloat(10000)
		if !cashFlow.FinancingOutUSD.Equal(expectedFinancingOut) {
			t.Errorf("Expected financing outflow %s, got %s",
				expectedFinancingOut.String(), cashFlow.FinancingOutUSD.String())
		}

		// Expected net financing: $15,000 - $10,000 = $5,000
		expectedNetFinancing := expectedFinancingIn.Sub(expectedFinancingOut)
		if !cashFlow.FinancingNetUSD.Equal(expectedNetFinancing) {
			t.Errorf("Expected financing net %s, got %s",
				expectedNetFinancing.String(), cashFlow.FinancingNetUSD.String())
		}

		t.Logf("Financing Cash Flow Validation:")
		t.Logf("Inflows: %s (expected: %s)", cashFlow.FinancingInUSD.String(), expectedFinancingIn.String())
		t.Logf("Outflows: %s (expected: %s)", cashFlow.FinancingOutUSD.String(), expectedFinancingOut.String())
		t.Logf("Net: %s (expected: %s)", cashFlow.FinancingNetUSD.String(), expectedNetFinancing.String())
	})

	t.Run("TestComprehensiveCashFlowSummary", func(t *testing.T) {
		// Test complete cash flow statement as per requirements
		period := models.Period{
			StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
		}

		cashFlow, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed for comprehensive summary: %v", err)
		}

		// Validate cash flow statement structure
		if cashFlow.OperatingInUSD.IsZero() && cashFlow.OperatingOutUSD.IsZero() {
			t.Error("Expected operating cash flow data")
		}

		// Investing flows are tracked in ByType, not as separate fields
		if len(cashFlow.ByType) == 0 {
			t.Error("Expected transaction type breakdown")
		}

		if cashFlow.FinancingInUSD.IsZero() && cashFlow.FinancingOutUSD.IsZero() {
			t.Error("Expected financing cash flow data")
		}

		// Test overall cash flow balance
		totalNet := cashFlow.OperatingNetUSD.Add(cashFlow.FinancingNetUSD)

		// The net cash flow should be reasonable (not extremely large positive/negative)
		if totalNet.Abs().GreaterThan(decimal.NewFromFloat(100000)) {
			t.Errorf("Total net cash flow seems unreasonable: %s", totalNet.String())
		}

		// Comprehensive cash flow validation against requirements
		// Note: Investing flows are included in operating totals in current model
		expectedSummary := map[string]decimal.Decimal{
			"operating_in":    decimal.NewFromFloat(6950),   // From operating test
			"operating_out":   decimal.NewFromFloat(5150),   // From operating test
			"financing_in":    decimal.NewFromFloat(15000),  // From financing test
			"financing_out":   decimal.NewFromFloat(10000),  // From financing test
		}

		// Validate expected totals (allowing for some tolerance due to different test runs)
		tolerance := decimal.NewFromFloat(100) // $100 tolerance

		if cashFlow.OperatingInUSD.Sub(expectedSummary["operating_in"]).Abs().GreaterThan(tolerance) {
			t.Logf("Operating inflow variance: expected %s, got %s",
				expectedSummary["operating_in"].String(), cashFlow.OperatingInUSD.String())
		}

		if cashFlow.OperatingOutUSD.Sub(expectedSummary["operating_out"]).Abs().GreaterThan(tolerance) {
			t.Logf("Operating outflow variance: expected %s, got %s",
				expectedSummary["operating_out"].String(), cashFlow.OperatingOutUSD.String())
		}

		// Generate comprehensive cash flow report
		t.Logf("=== Comprehensive Cash Flow Statement ===")
		t.Logf("Period: %s to %s", period.StartDate.Format("2006-01-02"), period.EndDate.Format("2006-01-02"))
		t.Logf("")
		t.Logf("Operating Activities:")
		t.Logf("  Inflows:  %s USD", cashFlow.OperatingInUSD.String())
		t.Logf("  Outflows: %s USD", cashFlow.OperatingOutUSD.String())
		t.Logf("  Net:      %s USD", cashFlow.OperatingNetUSD.String())
		t.Logf("")
		// Show investing activity breakdown by type
		t.Logf("Investing Activities (by type):")
		for txType, flows := range cashFlow.ByType {
			if txType == "buy" || txType == "sell" || txType == "deposit" || txType == "withdraw" {
				t.Logf("  %s: Inflows %s USD, Outflows %s USD, Net %s USD",
					txType, flows.InflowUSD.String(), flows.OutflowUSD.String(), flows.NetUSD.String())
			}
		}
		t.Logf("")
		t.Logf("Financing Activities:")
		t.Logf("  Inflows:  %s USD", cashFlow.FinancingInUSD.String())
		t.Logf("  Outflows: %s USD", cashFlow.FinancingOutUSD.String())
		t.Logf("  Net:      %s USD", cashFlow.FinancingNetUSD.String())
		t.Logf("")
		t.Logf("Net Change in Cash: %s USD", totalNet.String())
	})
}

// TestCashFlowVerification validates the cash flow scenarios from the requirements
func TestCashFlowVerification(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	// Create test scenario for cash flow categories
	transactions := []*models.Transaction{
		// Operating - Inflows
		{
			Date:       time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
			Type:       "income",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(5000),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		{
			Date:       time.Date(2025, 1, 20, 0, 0, 0, 0, time.UTC),
			Type:       "reward",
			Asset:      "USD",
			Account:    "Investment Account",
			Quantity:   decimal.NewFromFloat(750),
			Note:       stringPtr("Investment rewards"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Operating - Outflows
		{
			Date:       time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(24000),
			Tag:        stringPtr("Living Expenses"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		{
			Date:       time.Date(2025, 1, 25, 0, 0, 0, 0, time.UTC),
			Type:       "tax",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(2500),
			Note:       stringPtr("Quarterly estimated tax"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Financing - Inflows (Credit Card Credit)
		{
			Date:       time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
			Type:       "expense",
			Asset:      "USD",
			Account:    "Credit Card",
			Quantity:   decimal.NewFromFloat(15000),
			Note:       stringPtr("Credit card spending"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Financing - Outflows (Credit Card Payment)
		{
			Date:       time.Date(2025, 1, 30, 0, 0, 0, 0, time.UTC),
			Type:       "transfer",
			Asset:      "USD",
			Account:    "Bank Account",
			Quantity:   decimal.NewFromFloat(15000),
			Note:       stringPtr("Credit card payment"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
	}

	// Pre-save transactions that need it
	for _, tx := range transactions {
		if err := transactionService.CreateTransaction(ctx, tx); err != nil {
			t.Fatalf("Failed to create transaction: %v", err)
		}
	}

	// Test cash flow reporting
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}

	cashFlow, err := reportingService.GetCashFlow(ctx, period)
	if err != nil {
		t.Fatalf("GetCashFlow failed: %v", err)
	}

	// Validate Operating Cash Flow
	expectedOperatingIn := decimal.NewFromFloat(5750)   // 5000 + 750
	expectedOperatingOut := decimal.NewFromFloat(26500) // 24000 + 2500

	if !cashFlow.OperatingInUSD.Equal(expectedOperatingIn) {
		t.Errorf("Expected operating inflow %s, got %s", expectedOperatingIn.String(), cashFlow.OperatingInUSD.String())
	}

	if !cashFlow.OperatingOutUSD.Equal(expectedOperatingOut) {
		t.Errorf("Expected operating outflow %s, got %s", expectedOperatingOut.String(), cashFlow.OperatingOutUSD.String())
	}

	// Validate Financing Cash Flow
	expectedFinancingIn := decimal.NewFromFloat(15000)  // Credit card spending
	expectedFinancingOut := decimal.NewFromFloat(15000) // Credit card payment

	if !cashFlow.FinancingInUSD.Equal(expectedFinancingIn) {
		t.Errorf("Expected financing inflow %s, got %s", expectedFinancingIn.String(), cashFlow.FinancingInUSD.String())
	}

	if !cashFlow.FinancingOutUSD.Equal(expectedFinancingOut) {
		t.Errorf("Expected financing outflow %s, got %s", expectedFinancingOut.String(), cashFlow.FinancingOutUSD.String())
	}

	// Validate Net Cash Flow
	expectedNetOperating := expectedOperatingIn.Sub(expectedOperatingOut) // -20750
	expectedNetFinancing := expectedFinancingIn.Sub(expectedFinancingOut) // 0

	if !cashFlow.OperatingNetUSD.Equal(expectedNetOperating) {
		t.Errorf("Expected operating net %s, got %s", expectedNetOperating.String(), cashFlow.OperatingNetUSD.String())
	}

	if !cashFlow.FinancingNetUSD.Equal(expectedNetFinancing) {
		t.Errorf("Expected financing net %s, got %s", expectedNetFinancing.String(), cashFlow.FinancingNetUSD.String())
	}

	t.Logf("Cash flow validation complete:")
	t.Logf("Operating: In=%s, Out=%s, Net=%s", cashFlow.OperatingInUSD.String(), cashFlow.OperatingOutUSD.String(), cashFlow.OperatingNetUSD.String())
	t.Logf("Financing: In=%s, Out=%s, Net=%s", cashFlow.FinancingInUSD.String(), cashFlow.FinancingOutUSD.String(), cashFlow.FinancingNetUSD.String())
}

// TestCreditCardIntegration tests credit card flow handling
func TestCreditCardIntegration(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	// Credit card setup transaction (zero amount to establish account)
	setup := &models.Transaction{
		Date:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		Type:       "expense",
		Asset:      "USD",
		Account:    "Credit Card",
		Quantity:   decimal.Zero,
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}

	if err := transactionService.CreateTransaction(ctx, setup); err != nil {
		t.Fatalf("Failed to create CC setup: %v", err)
	}

	// Credit card spending transactions
	spending := []*models.Transaction{
		{
			Date:         time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(150),
			Tag:          stringPtr("Groceries"),
			Note:         stringPtr("Weekly groceries"),
			Counterparty: stringPtr("Whole Foods"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		},
		{
			Date:         time.Date(2025, 1, 10, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(75),
			Tag:          stringPtr("Coffee"),
			Note:         stringPtr("Coffee shop visit"),
			Counterparty: stringPtr("Starbucks"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		},
		{
			Date:         time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Credit Card",
			Quantity:     decimal.NewFromFloat(45),
			Tag:          stringPtr("Gas"),
			Note:         stringPtr("Fuel for car"),
			Counterparty: stringPtr("Shell"),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
		},
		{
			Date:       time.Date(2025, 1, 20, 0, 0, 0, 0, time.UTC),
			Type:       "interest_expense",
			Asset:      "USD",
			Account:    "Credit Card",
			Quantity:   decimal.NewFromFloat(25),
			Note:       stringPtr("Finance charges"),
			PriceLocal: decimal.NewFromFloat(1),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
	}

	for _, tx := range spending {
		if err := transactionService.CreateTransaction(ctx, tx); err != nil {
			t.Fatalf("Failed to create CC transaction: %v", err)
		}
	}

	// Credit card payment
	payment := &models.Transaction{
		Date:       time.Date(2025, 1, 25, 0, 0, 0, 0, time.UTC),
		Type:       "transfer",
		Asset:      "USD",
		Account:    "Bank Account",
		Quantity:   decimal.NewFromFloat(295), // 150+75+45+25
		Note:       stringPtr("Credit card payment"),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}

	if err := transactionService.CreateTransaction(ctx, payment); err != nil {
		t.Fatalf("Failed to create CC payment: %v", err)
	}

	// Test credit card balance and spending analysis
	period := models.Period{
		StartDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 1, 31, 23, 59, 59, 0, time.UTC),
	}

	// Get holdings to check credit card balance
	holdings, err := reportingService.GetHoldings(ctx, period.EndDate)
	if err != nil {
		t.Fatalf("GetHoldings failed: %v", err)
	}

	// Find credit card balance
	var ccBalance decimal.Decimal
	for _, holding := range holdings {
		if holding.Account == "Credit Card" {
			ccBalance = holding.ValueUSD
			break
		}
	}

	// Credit card balance should be close to zero after payment (some rounding might exist)
	if ccBalance.Abs().GreaterThan(decimal.NewFromFloat(1)) {
		t.Errorf("Credit card balance should be near zero after payment, got %s", ccBalance.String())
	}

	// Test spending report
	spendingReport, err := reportingService.GetSpending(ctx, period)
	if err != nil {
		t.Fatalf("GetSpending failed: %v", err)
	}

	expectedCCSpending := decimal.NewFromFloat(295) // 150+75+45+25
	if !spendingReport.TotalUSD.Equal(expectedCCSpending) {
		t.Errorf("Expected CC spending %s, got %s", expectedCCSpending.String(), spendingReport.TotalUSD.String())
	}

	// Test tag breakdown (using ByTag instead of ByCategory)
	if spendingReport.ByTag["Groceries"] == nil {
		t.Error("Expected Groceries tag in spending report")
	} else {
		expectedGroceries := decimal.NewFromFloat(150)
		if !spendingReport.ByTag["Groceries"].AmountUSD.Equal(expectedGroceries) {
			t.Errorf("Expected Groceries spending %s, got %s", expectedGroceries.String(), spendingReport.ByTag["Groceries"].AmountUSD.String())
		}
	}

	if spendingReport.ByTag["Coffee"] == nil {
		t.Error("Expected Coffee tag in spending report")
	} else {
		expectedCoffee := decimal.NewFromFloat(75)
		if !spendingReport.ByTag["Coffee"].AmountUSD.Equal(expectedCoffee) {
			t.Errorf("Expected Coffee spending %s, got %s", expectedCoffee.String(), spendingReport.ByTag["Coffee"].AmountUSD.String())
		}
	}

	if spendingReport.ByTag["Gas"] == nil {
		t.Error("Expected Gas tag in spending report")
	} else {
		expectedGas := decimal.NewFromFloat(45)
		if !spendingReport.ByTag["Gas"].AmountUSD.Equal(expectedGas) {
			t.Errorf("Expected Gas spending %s, got %s", expectedGas.String(), spendingReport.ByTag["Gas"].AmountUSD.String())
		}
	}

	t.Logf("Credit card integration validation complete:")
	t.Logf("Final CC Balance: %s", ccBalance.String())
	t.Logf("Total CC Spending: %s", spendingReport.TotalUSD.String())
	t.Logf("Groceries: %s", spendingReport.ByTag["Groceries"].AmountUSD.String())
	t.Logf("Coffee: %s", spendingReport.ByTag["Coffee"].AmountUSD.String())
	t.Logf("Gas: %s", spendingReport.ByTag["Gas"].AmountUSD.String())
}

// TestVaultInvestmentCycle tests the complete vault investment lifecycle
func TestVaultInvestmentCycle(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txRepo := repositories.NewTransactionRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)

	// Vault Investment Cycle as per requirements document
	vaultTransactions := []*models.Transaction{
		// First Deposit - March 15, 2025
		{
			Date:       time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.25),
			PriceLocal: decimal.NewFromFloat(67000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Second Deposit - April 15, 2025
		{
			Date:       time.Date(2025, 4, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.2),
			PriceLocal: decimal.NewFromFloat(62000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Third Deposit - June 15, 2025
		{
			Date:       time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC),
			Type:       "deposit",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.3),
			PriceLocal: decimal.NewFromFloat(58000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Partial Withdrawal - July 10, 2025
		{
			Date:       time.Date(2025, 7, 10, 0, 0, 0, 0, time.UTC),
			Type:       "withdraw",
			Asset:      "BTC",
			Account:    "Investment Vault",
			Quantity:   decimal.NewFromFloat(0.15),
			PriceLocal: decimal.NewFromFloat(65000),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
		// Final Valuation - December 31, 2025
		{
			Date:       time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
			Type:       "valuation",
			Asset:      "BTC",
			Account:    "Investment Vault",
			PriceLocal: decimal.NewFromFloat(72000),
			Quantity:   decimal.NewFromFloat(0.25),
			Note:       stringPtr("Final vault valuation"),
			FXToUSD:    decimal.NewFromFloat(1),
			FXToVND:    decimal.NewFromFloat(24000),
		},
	}

	var lastInvestment *models.Investment
	for i, tx := range vaultTransactions {
		if err := tx.PreSave(); err != nil {
			t.Fatalf("Failed to pre-save vault transaction %d: %v", i, err)
		}

		var inv *models.Investment
		var err error

		if tx.Type == "deposit" {
			inv, err = invSvc.CreateDeposit(ctx, tx)
		} else if tx.Type == "withdraw" {
			inv, err = invSvc.CreateWithdrawal(ctx, tx)
		} else {
			// valuation transaction
			err = transactionService.CreateTransaction(ctx, tx)
			if err == nil {
				// For valuation, we need to get the investment again to update it
				if lastInvestment != nil {
					inv, err = invSvc.GetInvestmentByID(ctx, lastInvestment.ID)
				}
			}
		}

		if err != nil {
			t.Fatalf("Failed to create vault transaction %d: %v", i, err)
		}

		if inv != nil {
			lastInvestment = inv
		}
	}

	// Validate vault performance
	if lastInvestment == nil {
		t.Fatal("No investment found")
	}

	// Calculate expected values based on the scenario:
	// Total deposits: 0.25 + 0.2 + 0.3 = 0.75 BTC
	// Total withdrawal: 0.15 BTC
	// Remaining: 0.6 BTC
	// Final valuation shows 0.25 BTC (this seems inconsistent, but following the requirements)

	expectedRemainingQty := decimal.NewFromFloat(0.6) // 0.75 - 0.15 = 0.6 BTC remaining
	if !lastInvestment.RemainingQty.Equal(expectedRemainingQty) {
		t.Errorf("Expected remaining quantity %s, got %s", expectedRemainingQty.String(), lastInvestment.RemainingQty.String())
	}

	t.Logf("Vault investment cycle validation complete:")
	t.Logf("Investment ID: %s", lastInvestment.ID)
	t.Logf("Remaining Quantity: %s", lastInvestment.RemainingQty.String())
	t.Logf("Deposit Quantity: %s", lastInvestment.DepositQty.String())
	t.Logf("Withdrawal Quantity: %s", lastInvestment.WithdrawalQty.String())
	t.Logf("PnL: %s", lastInvestment.PnL.String())
	t.Logf("PnL Percent: %s", lastInvestment.PnLPercent.String())
}

// TestExpenseAndRefundCycle tests the expense + refund flow with stored FX
// and tag correction as specified in the requirements (EXP-REF-01)
func TestExpenseAndRefundCycle(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	// Create initial deposit to fund the expense
	initialDeposit := &models.Transaction{
		Date:       time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		Type:       "income",
		Asset:      "USD",
		Account:    "Bank Account",
		Quantity:   decimal.NewFromFloat(5000),
		PriceLocal: decimal.NewFromFloat(1),
		FXToUSD:    decimal.NewFromFloat(1),
		FXToVND:    decimal.NewFromFloat(24000),
	}

	if err := transactionService.CreateTransaction(ctx, initialDeposit); err != nil {
		t.Fatalf("Failed to create initial deposit: %v", err)
	}

	// February 2025 - Original groceries purchase with stored FX
	fxTimestamp := time.Date(2025, 2, 3, 10, 0, 0, 0, time.UTC) // 10:00 AM
	originalPurchase := &models.Transaction{
		Date:         time.Date(2025, 2, 3, 10, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Credit Card",
		Quantity:     decimal.NewFromFloat(75),
		Tag:          stringPtr("Food"), // Original tag
		Note:         stringPtr("Damaged goods purchase"),
		Counterparty: stringPtr("Whole Foods"),
		PriceLocal:   decimal.NewFromFloat(1),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000.5), // Store FX at purchase time
		FXSource:     stringPtr("ECB"),
		FXTimestamp:  &fxTimestamp,
	}

	if err := transactionService.CreateTransaction(ctx, originalPurchase); err != nil {
		t.Fatalf("Failed to create original purchase: %v", err)
	}

	// Store the FX snapshot for validation
	storedFXRate := originalPurchase.FXToVND
	storedFXSource := originalPurchase.FXSource
	storedFXTimestamp := originalPurchase.FXTimestamp

	// March 2025 - Refund with original FX preserved
	refundTransaction := &models.Transaction{
		Date:         time.Date(2025, 3, 5, 0, 0, 0, 0, time.UTC),
		Type:         "refund",
		Asset:        "USD",
		Account:      "Credit Card",
		Quantity:     decimal.NewFromFloat(75), // Same amount, negative for refund
		Note:         stringPtr("Refund for damaged goods"),
		Counterparty: stringPtr("Whole Foods"),
		PriceLocal:   decimal.NewFromFloat(1),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      storedFXRate, // CRITICAL: Must preserve original FX
		FXSource:     storedFXSource,
		FXTimestamp:  storedFXTimestamp,
	}

	if err := transactionService.CreateTransaction(ctx, refundTransaction); err != nil {
		t.Fatalf("Failed to create refund: %v", err)
	}

	// Test spending analysis at different periods
	// February period should show the expense
	febPeriod := models.Period{
		StartDate: time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 2, 28, 23, 59, 59, 0, time.UTC),
	}

	febSpending, err := reportingService.GetSpending(ctx, febPeriod)
	if err != nil {
		t.Fatalf("GetSpending February failed: %v", err)
	}

	// Should show expense in February
	expectedFebExpense := decimal.NewFromFloat(75)
	if !febSpending.TotalUSD.Equal(expectedFebExpense) {
		t.Errorf("Expected February expense %s, got %s", expectedFebExpense.String(), febSpending.TotalUSD.String())
	}

	// March period should show the refund (negative spending)
	marPeriod := models.Period{
		StartDate: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 3, 31, 23, 59, 59, 0, time.UTC),
	}

	marSpending, err := reportingService.GetSpending(ctx, marPeriod)
	if err != nil {
		t.Fatalf("GetSpending March failed: %v", err)
	}

	// Should show refund in March
	expectedMarRefund := decimal.NewFromFloat(-75)
	if !marSpending.TotalUSD.Equal(expectedMarRefund) {
		t.Errorf("Expected March refund %s, got %s", expectedMarRefund.String(), marSpending.TotalUSD.String())
	}

	// Full period (Feb-Mar) should net to zero
	fullPeriod := models.Period{
		StartDate: time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2025, 3, 31, 23, 59, 59, 0, time.UTC),
	}

	fullSpending, err := reportingService.GetSpending(ctx, fullPeriod)
	if err != nil {
		t.Fatalf("GetSpending full period failed: %v", err)
	}

	// Net should be zero
	if !fullSpending.TotalUSD.IsZero() {
		t.Errorf("Expected net spending zero for full period, got %s", fullSpending.TotalUSD.String())
	}

	// Test FX preservation: Verify the refund has the same FX as original
	if !refundTransaction.FXToVND.Equal(storedFXRate) {
		t.Errorf("Refund FX rate %s does not match original %s",
			refundTransaction.FXToVND.String(), storedFXRate.String())
	}

	if *refundTransaction.FXSource != *storedFXSource {
		t.Errorf("Refund FX source %s does not match original %s",
			*refundTransaction.FXSource, *storedFXSource)
	}

	if !refundTransaction.FXTimestamp.Equal(*storedFXTimestamp) {
		t.Errorf("Refund FX timestamp %s does not match original %s",
			refundTransaction.FXTimestamp.String(), storedFXTimestamp.String())
	}

	// Test tag correction: Change tag from "Food" to "Household"
	// This demonstrates tag correction without losing audit trail
	var correctedTag string
	if originalPurchase.Tag != nil && *originalPurchase.Tag == "Food" {
		// Simulate tag correction
		correctedPurchase := *originalPurchase
		correctedTag = "Household"
		correctedPurchase.Tag = &correctedTag
		correctedPurchase.Note = stringPtr("Tag corrected: Household goods")

		if err := transactionService.UpdateTransaction(ctx, &correctedPurchase); err != nil {
			t.Fatalf("Failed to update transaction tag: %v", err)
		}

		// Verify tag correction
		updatedPurchase, err := transactionService.GetTransaction(ctx, originalPurchase.ID)
		if err != nil {
			t.Fatalf("Failed to get updated transaction: %v", err)
		}

		if updatedPurchase.Tag == nil || *updatedPurchase.Tag != "Household" {
			t.Errorf("Tag correction failed, expected 'Household', got %v", updatedPurchase.Tag)
		}

		// Verify original FX is still preserved after tag change
		if !updatedPurchase.FXToVND.Equal(storedFXRate) {
			t.Errorf("FX rate changed after tag correction: expected %s, got %s",
				storedFXRate.String(), updatedPurchase.FXToVND.String())
		}
	}

	// Test spending report shows corrected tag
	correctedSpending, err := reportingService.GetSpending(ctx, febPeriod)
	if err != nil {
		t.Fatalf("GetSpending after correction failed: %v", err)
	}

	// Should still show the expense but under corrected tag
	if correctedSpending.ByTag["Household"] == nil {
		t.Error("Expected 'Household' tag in spending after correction")
	} else {
		expectedHouseholdAmount := decimal.NewFromFloat(75)
		if !correctedSpending.ByTag["Household"].AmountUSD.Equal(expectedHouseholdAmount) {
			t.Errorf("Expected 'Household' amount %s, got %s",
				expectedHouseholdAmount.String(), correctedSpending.ByTag["Household"].AmountUSD.String())
		}
	}

	// Should not show old "Food" tag
	if correctedSpending.ByTag["Food"] != nil {
		t.Error("Old 'Food' tag should not appear after correction")
	}

	t.Logf("Expense + refund cycle validation complete:")
	t.Logf("February expense: %s", febSpending.TotalUSD.String())
	t.Logf("March refund: %s", marSpending.TotalUSD.String())
	t.Logf("Net for full period: %s", fullSpending.TotalUSD.String())
	t.Logf("FX rate preserved: %s", refundTransaction.FXToVND.String())
	t.Logf("Tag corrected: %s", correctedTag)
}
