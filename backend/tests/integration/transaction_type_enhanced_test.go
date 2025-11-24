package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// TestEnhancedTransactionTypes tests the new comprehensive transaction type taxonomy
func TestEnhancedTransactionTypes(t *testing.T) {
	t.Run("TestTransactionTypeHierarchy", func(t *testing.T) {
		// Test operating category types
		operatingTypes := []struct {
			name        string
			category    models.TransactionCategory
			subcategory models.TransactionSubcategory
			expense     bool
		}{
			{"Income Salary", models.CashFlowOperating, models.SubcategoryIncome, false},
			{"Expense Food", models.CashFlowOperating, models.SubcategoryExpense, true},
			{"Interest Income", models.CashFlowOperating, models.SubcategoryInterest, false},
			{"Bank Fee", models.CashFlowOperating, models.SubcategoryFee, true},
			{"Tax Payment", models.CashFlowOperating, models.SubcategoryTax, true},
		}

		for i, tt := range operatingTypes {
			t.Run(tt.name, func(t *testing.T) {
				transactionType := &models.TransactionType{
					Name:        tt.name,
					Category:    tt.category,
					Subcategory: tt.subcategory,
					IsActive:    true,
					SortOrder:   i,
				}

				if err := transactionType.Validate(); err != nil {
					t.Fatalf("TransactionType validation failed for %s: %v", tt.name, err)
				}

				// Test that category and subcategory are properly set
				if transactionType.Category != tt.category {
					t.Errorf("Expected category %s, got %s", tt.category, transactionType.Category)
				}
				if transactionType.Subcategory != tt.subcategory {
					t.Errorf("Expected subcategory %s, got %s", tt.subcategory, transactionType.Subcategory)
				}
			})
		}
	})

	t.Run("TestInvestmentTransactionTypes", func(t *testing.T) {
		// Test investing category types
		investmentTypes := []struct {
			name        string
			category    models.TransactionCategory
			subcategory models.TransactionSubcategory
			cashFlow    bool
		}{
			{"Buy Stock", models.CashFlowInvesting, models.SubcategoryBuy, true},
			{"Sell Stock", models.CashFlowInvesting, models.SubcategorySell, true},
			{"Crypto Deposit", models.CashFlowInvesting, models.SubcategoryDeposit, false},
			{"Crypto Withdrawal", models.CashFlowInvesting, models.SubcategoryWithdraw, false},
			{"Stake Tokens", models.CashFlowInvesting, models.SubcategoryStake, false},
			{"Unstake Tokens", models.CashFlowInvesting, models.SubcategoryUnstake, false},
			{"Lend Asset", models.CashFlowInvesting, models.SubcategoryLend, true},
			{"Borrow Asset", models.CashFlowFinancing, models.SubcategoryBorrow, false},
			{"Yield Reward", models.CashFlowInvesting, models.SubcategoryYield, false},
			{"Airdrop", models.CashFlowInvesting, models.SubcategoryAirdrop, false},
			{"Staking Reward", models.CashFlowInvesting, models.SubcategoryReward, false},
			{"Claim Rewards", models.CashFlowInvesting, models.SubcategoryClaim, false},
			{"Token Swap", models.CashFlowInvesting, models.SubcategorySwap, true},
		}

		for i, tt := range investmentTypes {
			t.Run(tt.name, func(t *testing.T) {
				transactionType := &models.TransactionType{
					Name:        tt.name,
					Category:    tt.category,
					Subcategory: tt.subcategory,
					IsActive:    true,
					SortOrder:   i,
				}

				if err := transactionType.Validate(); err != nil {
					t.Fatalf("TransactionType validation failed for %s: %v", tt.name, err)
				}

				// Test category/subcategory relationships
				validCategory := false
				validSubcategory := false

				// Check if category is valid
				switch tt.category {
				case models.CashFlowOperating, models.CashFlowFinancing,
					models.CashFlowInvesting, models.CashFlowTransfer,
					models.CashFlowValuation:
					validCategory = true
				}

				// Check if subcategory is valid
				switch tt.subcategory {
				case models.SubcategoryIncome, models.SubcategoryExpense,
					models.SubcategoryInterest, models.SubcategoryFee,
					models.SubcategoryTax, models.SubcategoryBuy,
					models.SubcategorySell, models.SubcategoryDeposit,
					models.SubcategoryWithdraw, models.SubcategoryStake,
					models.SubcategoryUnstake, models.SubcategoryLend,
					models.SubcategoryBorrow, models.SubcategoryRepay,
					models.SubcategoryYield, models.SubcategoryAirdrop,
					models.SubcategoryReward, models.SubcategoryClaim,
					models.SubcategorySwap, models.SubcategoryTransfer,
					models.SubcategoryInternalMove, models.SubcategoryValuation,
					models.SubcategoryAdjustment:
					validSubcategory = true
				}

				if !validCategory {
					t.Errorf("Invalid category %s for %s", tt.category, tt.name)
				}
				if !validSubcategory {
					t.Errorf("Invalid subcategory %s for %s", tt.subcategory, tt.name)
				}
			})
		}
	})

	t.Run("TestTransactionTypeValidationRules", func(t *testing.T) {
		// Test validation rules for different transaction types
		validationTests := []struct {
			name           string
			requiredFields []string
			validAccounts  []string
			minAmount      *models.DecimalAmount
			maxAmount      *models.DecimalAmount
		}{
			{
				name:           "expense",
				requiredFields: []string{"date", "type", "asset", "account", "quantity", "price_local"},
				validAccounts:  []string{"CreditCard", "Bank", "Cash"},
				minAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(0.01), Currency: "USD"},
				maxAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(100000), Currency: "USD"},
			},
			{
				name:           "income",
				requiredFields: []string{"date", "type", "asset", "account", "quantity", "price_local"},
				validAccounts:  []string{"Bank", "Cash"},
				minAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(0.01), Currency: "USD"},
				maxAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(1000000), Currency: "USD"},
			},
			{
				name:           "buy",
				requiredFields: []string{"date", "type", "asset", "account", "quantity", "price_local"},
				validAccounts:  []string{"Exchange", "Investment"},
				minAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(1), Currency: "USD"},
				maxAmount:      &models.DecimalAmount{Amount: decimal.NewFromFloat(1000000), Currency: "USD"},
			},
		}

		for _, tt := range validationTests {
			t.Run(tt.name, func(t *testing.T) {
				// Create validation rules
				rules := &models.TransactionTypeValidationRules{
					TypeID:           1,
					RequiredFields:   tt.requiredFields,
					ValidAccounts:    tt.validAccounts,
					MinAmount:        tt.minAmount,
					MaxAmount:        tt.maxAmount,
					CashFlowImpact:   true,
					QuantityRequired: true,
					PriceRequired:    true,
				}

				// Test validation rules structure
				if len(rules.RequiredFields) == 0 {
					t.Error("Required fields should not be empty")
				}
				if len(rules.ValidAccounts) == 0 {
					t.Error("Valid accounts should not be empty")
				}

				// Test decimal amounts
				if rules.MinAmount != nil && rules.MinAmount.Amount.IsNegative() {
					t.Error("Minimum amount should not be negative")
				}
				if rules.MaxAmount != nil && rules.MaxAmount.Amount.IsNegative() {
					t.Error("Maximum amount should not be negative")
				}
			})
		}
	})

	t.Run("TestDecimalAmountPrecision", func(t *testing.T) {
		// Test decimal precision for financial calculations
		precisionTests := []struct {
			amount    decimal.Decimal
			currency  string
			precision int
			roundType string
		}{
			{decimal.NewFromFloat(123.456789), "USD", 2, "bankers"},
			{decimal.NewFromFloat(123.456789), "VND", 0, "floor"},
			{decimal.NewFromFloat(0.005), "USD", 2, "bankers"},
			{decimal.NewFromFloat(0.004), "USD", 2, "bankers"},
		}

		for i, tt := range precisionTests {
			t.Run("precision_test_"+string(rune(i)), func(t *testing.T) {
				amount := &models.DecimalAmount{
					Amount:   tt.amount,
					Currency: tt.currency,
				}

				// Test amount validity
				if amount.Amount.IsNegative() {
					t.Error("Amount should not be negative")
				}

				// Test currency
				if amount.Currency == "" {
					t.Error("Currency should not be empty")
				}

				// Test rounding based on currency
				var rounded decimal.Decimal
				switch tt.roundType {
				case "bankers":
					// Banker's rounding for USD
					rounded = amount.Amount.RoundBank(2)
				case "floor":
					// Floor rounding for VND (no decimals)
					rounded = amount.Amount.Floor()
				default:
					rounded = amount.Amount
				}

				// Verify rounding doesn't change the fundamental value significantly
				diff := amount.Amount.Sub(rounded).Abs()
				if tt.currency == "USD" && diff.GreaterThan(decimal.NewFromFloat(0.01)) {
					t.Errorf("Rounding error too large: %s vs %s", amount.Amount.String(), rounded.String())
				}
			})
		}
	})
}

// TestEnhancedCreditCardFlows tests improved credit card flow handling
func TestEnhancedCreditCardFlows(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	t.Run("TestCreditCardLiabilityTracking", func(t *testing.T) {
		start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)

		// Test 1: Initial credit card setup
		initTx := &models.Transaction{
			Date:         start,
			Type:         "expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Quantity:     decimal.NewFromFloat(0),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			Counterparty: stringPtr("Initial Setup"),
			Note:         stringPtr("Credit card account initialization"),
		}

		if err := transactionService.CreateTransaction(ctx, initTx); err != nil {
			t.Fatalf("Failed to create initial CC setup: %v", err)
		}

		// Test 2: Credit card spending
		spendTx := &models.Transaction{
			Date:         start.AddDate(0, 0, 1),
			Type:         "expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Quantity:     decimal.NewFromFloat(100),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			Counterparty: stringPtr("Amazon"),
			Tag:          stringPtr("Shopping"),
		}

		if err := transactionService.CreateTransaction(ctx, spendTx); err != nil {
			t.Fatalf("Failed to create CC spend: %v", err)
		}

		// Test 3: Interest accrual (if applicable)
		interestTx := &models.Transaction{
			Date:         start.AddDate(0, 0, 15),
			Type:         "interest_expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Quantity:     decimal.NewFromFloat(2.50),
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			Counterparty: stringPtr("Credit Card Company"),
			Tag:          stringPtr("Interest"),
		}

		if err := transactionService.CreateTransaction(ctx, interestTx); err != nil {
			t.Fatalf("Failed to create interest accrual: %v", err)
		}

		// Test 4: Credit card payment
		paymentTx := &models.Transaction{
			Date:         start.AddDate(0, 0, 30),
			Type:         "transfer",
			Asset:        "USD",
			Account:      "Bank",
			Quantity:     decimal.NewFromFloat(-102.50), // Negative from bank perspective
			PriceLocal:   decimal.NewFromFloat(1),
			FXToUSD:      decimal.NewFromFloat(1),
			FXToVND:      decimal.NewFromFloat(24000),
			Counterparty: stringPtr("Credit Card Company"),
			Tag:          stringPtr("Payment"),
		}

		if err := transactionService.CreateTransaction(ctx, paymentTx); err != nil {
			t.Fatalf("Failed to create CC payment: %v", err)
		}

		// Verify cash flow is handled correctly
		period := models.Period{StartDate: start, EndDate: end}
		report, err := reportingService.GetCashFlow(ctx, period)
		if err != nil {
			t.Fatalf("GetCashFlow failed: %v", err)
		}

		// Credit card spending should have zero immediate cash flow
		// Payment should show as bank outflow
		if report.OperatingOutUSD.IsZero() {
			t.Error("Expected operating outflow for payment")
		}

		// Test holdings to ensure proper liability tracking
		holdings, err := reportingService.GetHoldings(ctx, end)
		if err != nil {
			t.Fatalf("GetHoldings failed: %v", err)
		}

		// Find credit card account holdings
		var ccHolding *models.Holding
		for _, holding := range holdings {
			if holding.Account == "CreditCard" {
				ccHolding = holding
				break
			}
		}

		if ccHolding == nil {
			t.Error("No credit card holdings found")
		} else {
			// After payment, CC balance should be zero or minimal
			// (this depends on the exact business logic)
			if ccHolding.Quantity.IsNegative() {
				t.Error("Credit card quantity should not be negative in our model")
			}
		}
	})

	t.Run("TestCreditCardReporting", func(t *testing.T) {
		start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

		// Create multiple credit card transactions
		ccTransactions := []struct {
			date         time.Time
			amount       decimal.Decimal
			counterparty string
			tag          string
		}{
			{start.AddDate(0, 0, 1), decimal.NewFromFloat(50), "Coffee Shop", "Dining"},
			{start.AddDate(0, 0, 2), decimal.NewFromFloat(75), "Gas Station", "Transportation"},
			{start.AddDate(0, 0, 3), decimal.NewFromFloat(200), "Grocery Store", "Groceries"},
			{start.AddDate(0, 0, 4), decimal.NewFromFloat(120), "Online Retailer", "Shopping"},
		}

		for _, tx := range ccTransactions {
			ccTx := &models.Transaction{
				Date:         tx.date,
				Type:         "expense",
				Asset:        "USD",
				Account:      "CreditCard",
				Quantity:     tx.amount,
				PriceLocal:   decimal.NewFromFloat(1),
				FXToUSD:      decimal.NewFromFloat(1),
				FXToVND:      decimal.NewFromFloat(24000),
				Counterparty: stringPtr(tx.counterparty),
				Tag:          stringPtr(tx.tag),
			}

			if err := transactionService.CreateTransaction(ctx, ccTx); err != nil {
				t.Fatalf("Failed to create CC transaction: %v", err)
			}
		}

		// Test spending report for credit card transactions
		endDate := start.AddDate(0, 0, 10)
		period := models.Period{StartDate: start, EndDate: endDate}

		spendingReport, err := reportingService.GetSpending(ctx, period)
		if err != nil {
			t.Fatalf("GetSpending failed: %v", err)
		}

		// Verify spending breakdown by tag
		if len(spendingReport.ByTag) == 0 {
			t.Error("Expected spending breakdown by tag")
		}

		// Check if tags are properly categorized
		expectedTags := []string{"Dining", "Transportation", "Groceries", "Shopping"}
		for _, expectedTag := range expectedTags {
			if _, exists := spendingReport.ByTag[expectedTag]; !exists {
				t.Errorf("Expected tag %s not found in spending report", expectedTag)
			}
		}
	})
}

// TestEnhancedHoldingsReporting tests improved holdings and performance reporting
func TestEnhancedHoldingsReporting(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	t.Run("TestHoldingsPerformanceAttribution", func(t *testing.T) {
		start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

		// Create a series of investment transactions for performance testing
		transactions := []struct {
			date     time.Time
			action   string
			asset    string
			quantity decimal.Decimal
			price    decimal.Decimal
			account  string
		}{
			// Initial deposit
			{start, "deposit", "BTC", decimal.NewFromFloat(1), decimal.NewFromFloat(50000), "Exchange"},
			// Buy more
			{start.AddDate(0, 1, 0), "buy", "BTC", decimal.NewFromFloat(0.5), decimal.NewFromFloat(60000), "Exchange"},
			// Sell portion
			{start.AddDate(0, 2, 0), "sell", "BTC", decimal.NewFromFloat(0.3), decimal.NewFromFloat(65000), "Exchange"},
			// Add more
			{start.AddDate(0, 3, 0), "buy", "BTC", decimal.NewFromFloat(0.2), decimal.NewFromFloat(70000), "Exchange"},
		}

		for _, tx := range transactions {
			transaction := &models.Transaction{
				Date:       tx.date,
				Type:       tx.action,
				Asset:      tx.asset,
				Account:    tx.account,
				Quantity:   tx.quantity,
				PriceLocal: tx.price,
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			}

			if err := transactionService.CreateTransaction(ctx, transaction); err != nil {
				t.Fatalf("Failed to create investment transaction: %v", err)
			}
		}

		// Test holdings at different time points
		testDates := []time.Time{
			start.AddDate(0, 1, 0),
			start.AddDate(0, 2, 0),
			start.AddDate(0, 3, 0),
			start.AddDate(0, 4, 0),
		}

		for i, testDate := range testDates {
			t.Run("holdings_test_"+string(rune(i)), func(t *testing.T) {
				holdings, err := reportingService.GetHoldings(ctx, testDate)
				if err != nil {
					t.Fatalf("GetHoldings failed for date %s: %v", testDate.Format("2006-01-02"), err)
				}

				// Find BTC holdings
				var btcHolding *models.Holding
				for _, holding := range holdings {
					if holding.Asset == "BTC" {
						btcHolding = holding
						break
					}
				}

				if btcHolding == nil {
					t.Error("No BTC holdings found")
				} else {
					// Verify holdings calculation
					if btcHolding.Quantity.IsNegative() {
						t.Error("Holdings quantity should not be negative")
					}
					if btcHolding.ValueUSD.IsNegative() {
						t.Error("Holdings value should not be negative")
					}
					if btcHolding.Percentage.IsNegative() || btcHolding.Percentage.GreaterThan(decimal.NewFromFloat(100)) {
						t.Error("Holdings percentage should be between 0 and 100")
					}
				}

				// Test aggregated holdings by asset
				byAsset, err := reportingService.GetHoldingsByAsset(ctx, testDate)
				if err != nil {
					t.Fatalf("GetHoldingsByAsset failed: %v", err)
				}

				// Verify total portfolio value consistency
				var totalValueUSD decimal.Decimal
				for _, holding := range holdings {
					totalValueUSD = totalValueUSD.Add(holding.ValueUSD)
				}

				// Compare with asset-aggregated holdings
				var aggregatedValueUSD decimal.Decimal
				for _, holding := range byAsset {
					aggregatedValueUSD = aggregatedValueUSD.Add(holding.ValueUSD)
				}

				if !totalValueUSD.Equal(aggregatedValueUSD) {
					t.Errorf("Holdings value mismatch: total=%s, aggregated=%s",
						totalValueUSD.String(), aggregatedValueUSD.String())
				}
			})
		}
	})

	t.Run("TestHoldingsByAccountReporting", func(t *testing.T) {
		start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		testDate := start.AddDate(0, 3, 0)

		// Create transactions across different accounts
		accountTransactions := []struct {
			asset    string
			account  string
			quantity decimal.Decimal
			price    decimal.Decimal
		}{
			{"BTC", "Exchange", decimal.NewFromFloat(1), decimal.NewFromFloat(50000)},
			{"ETH", "Exchange", decimal.NewFromFloat(10), decimal.NewFromFloat(3000)},
			{"USD", "Bank", decimal.NewFromFloat(10000), decimal.NewFromFloat(1)},
			{"USD", "Cash", decimal.NewFromFloat(1000), decimal.NewFromFloat(1)},
			{"BTC", "Vault", decimal.NewFromFloat(0.5), decimal.NewFromFloat(50000)},
		}

		for _, tx := range accountTransactions {
			transaction := &models.Transaction{
				Date:       start,
				Type:       "deposit",
				Asset:      tx.asset,
				Account:    tx.account,
				Quantity:   tx.quantity,
				PriceLocal: tx.price,
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			}

			if err := transactionService.CreateTransaction(ctx, transaction); err != nil {
				t.Fatalf("Failed to create account transaction: %v", err)
			}
		}

		// Test holdings by account
		holdingsByAccount, err := reportingService.GetHoldingsByAccount(ctx, testDate)
		if err != nil {
			t.Fatalf("GetHoldingsByAccount failed: %v", err)
		}

		// Verify each account has holdings
		expectedAccounts := []string{"Exchange", "Bank", "Cash", "Vault"}
		for _, expectedAccount := range expectedAccounts {
			if _, exists := holdingsByAccount[expectedAccount]; !exists {
				t.Errorf("Expected account %s not found in holdings", expectedAccount)
			}
		}

		// Verify holdings values are reasonable
		for account, holdings := range holdingsByAccount {
			for _, holding := range holdings {
				if holding.Quantity.IsNegative() {
					t.Errorf("Negative quantity for account %s, asset %s", account, holding.Asset)
				}
				if holding.ValueUSD.IsNegative() {
					t.Errorf("Negative value for account %s, asset %s", account, holding.Asset)
				}
				if holding.Percentage.IsNegative() || holding.Percentage.GreaterThan(decimal.NewFromFloat(100)) {
					t.Errorf("Invalid percentage for account %s, asset %s: %s",
						account, holding.Asset, holding.Percentage.String())
				}
			}
		}
	})
}

// TestPrecisionFinancialCalculations tests enhanced decimal precision
func TestPrecisionFinancialCalculations(t *testing.T) {
	t.Run("TestDecimalPrecision", func(t *testing.T) {
		// Test various precision scenarios for financial calculations
		precisionTests := []struct {
			name     string
			input    decimal.Decimal
			expected decimal.Decimal
			places   int32
		}{
			{
				name:     "Basic rounding to 2 places",
				input:    decimal.NewFromFloat(123.456),
				expected: decimal.NewFromFloat(123.46),
				places:   2,
			},
			{
				name:     "Banker's rounding",
				input:    decimal.NewFromFloat(123.445),
				expected: decimal.NewFromFloat(123.44), // Banker's rounds to even
				places:   2,
			},
			{
				name:     "Large number precision",
				input:    decimal.NewFromFloat(123456789.123456789),
				expected: decimal.NewFromFloat(123456789.12),
				places:   2,
			},
		}

		for _, tt := range precisionTests {
			t.Run(tt.name, func(t *testing.T) {
				result := tt.input.RoundBank(tt.places)
				if !result.Equal(tt.expected) {
					t.Errorf("Expected %s, got %s", tt.expected.String(), result.String())
				}
			})
		}
	})

	t.Run("TestFXRatePrecision", func(t *testing.T) {
		// Test FX rate precision calculations
		testCases := []struct {
			name         string
			amount       decimal.Decimal
			fxRate       decimal.Decimal
			expected     decimal.Decimal
			precision    int32
			currencyFrom string
			currencyTo   string
		}{
			{
				name:         "USD to VND conversion",
				amount:       decimal.NewFromFloat(100),
				fxRate:       decimal.NewFromFloat(24000),
				expected:     decimal.NewFromFloat(2400000),
				precision:    0,
				currencyFrom: "USD",
				currencyTo:   "VND",
			},
			{
				name:         "VND to USD conversion",
				amount:       decimal.NewFromFloat(2400000),
				fxRate:       decimal.NewFromFloat(1).Div(decimal.NewFromFloat(24000)),
				expected:     decimal.NewFromFloat(100),
				precision:    2,
				currencyFrom: "VND",
				currencyTo:   "USD",
			},
		}

		for _, tt := range testCases {
			t.Run(tt.name, func(t *testing.T) {
				result := tt.amount.Mul(tt.fxRate).Round(tt.precision)
				if !result.Equal(tt.expected) {
					t.Errorf("Expected %s %s, got %s %s",
						tt.expected.String(), tt.currencyTo,
						result.String(), tt.currencyTo)
				}

				// Verify no precision loss in critical calculations
				backConverted := result.Div(tt.fxRate)
				diff := tt.amount.Sub(backConverted).Abs()
				if diff.GreaterThan(decimal.NewFromFloat(0.001)) {
					t.Errorf("Significant precision loss in FX conversion: diff=%s", diff.String())
				}
			})
		}
	})

	t.Run("TestInvestmentPnLCalculations", func(t *testing.T) {
		// Test P&L calculation precision
		pnlTests := []struct {
			name        string
			buyQty      decimal.Decimal
			buyPrice    decimal.Decimal
			sellQty     decimal.Decimal
			sellPrice   decimal.Decimal
			expectedPnL decimal.Decimal
		}{
			{
				name:        "Simple profit",
				buyQty:      decimal.NewFromFloat(1),
				buyPrice:    decimal.NewFromFloat(100),
				sellQty:     decimal.NewFromFloat(0.5),
				sellPrice:   decimal.NewFromFloat(120),
				expectedPnL: decimal.NewFromFloat(10), // (120-100) * 0.5 = 10
			},
			{
				name:        "Loss calculation",
				buyQty:      decimal.NewFromFloat(2),
				buyPrice:    decimal.NewFromFloat(50),
				sellQty:     decimal.NewFromFloat(1),
				sellPrice:   decimal.NewFromFloat(45),
				expectedPnL: decimal.NewFromFloat(-5), // (45-50) * 1 = -5
			},
		}

		for _, tt := range pnlTests {
			t.Run(tt.name, func(t *testing.T) {
				buyValue := tt.buyQty.Mul(tt.buyPrice)
				sellValue := tt.sellQty.Mul(tt.sellPrice)
				pnl := sellValue.Sub(buyValue.Mul(tt.sellQty).Div(tt.buyQty))

				// Alternative calculation method
				unitPnL := tt.sellPrice.Sub(tt.buyPrice)
				alternativePnL := unitPnL.Mul(tt.sellQty)

				if !pnl.Equal(alternativePnL) {
					t.Errorf("PnL calculation mismatch: %s vs %s", pnl.String(), alternativePnL.String())
				}

				if !pnl.Equal(tt.expectedPnL) {
					t.Errorf("Expected PnL %s, got %s", tt.expectedPnL.String(), pnl.String())
				}
			})
		}
	})
}
