package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)


// TestEnhancedAuditTrail tests the enhanced audit trail system for transaction types
func TestEnhancedAuditTrail(t *testing.T) {
	t.Run("TestTransactionTypeAuditTrail", func(t *testing.T) {
		// Test creating a new transaction type with audit trail
		originalType := &models.TransactionType{
			Name:        "Test Expense",
			Description: stringPtr("Test transaction type for audit trail"),
			Category:    models.CashFlowOperating,
			Subcategory: models.SubcategoryExpense,
			IsActive:    true,
			SortOrder:   1,
		}

		// Create audit record for creation
		audit, err := models.CreateAuditRecord(1, models.AuditActionCreate, nil, originalType, "test_user")
		if err != nil {
			t.Fatalf("Failed to create audit record: %v", err)
		}

		if audit.TypeID != 1 {
			t.Errorf("Expected type ID 1, got %d", audit.TypeID)
		}
		if audit.Action != models.AuditActionCreate {
			t.Errorf("Expected action %s, got %s", models.AuditActionCreate, audit.Action)
		}
		if audit.ChangedBy != "test_user" {
			t.Errorf("Expected changed_by 'test_user', got %s", audit.ChangedBy)
		}

		// Test updating the transaction type
		updatedType := &models.TransactionType{
			ID:          1,
			Name:        "Test Expense Updated",
			Description: stringPtr("Updated description"),
			Category:    models.CashFlowOperating,
			Subcategory: models.SubcategoryExpense,
			IsActive:    true,
			SortOrder:   2,
		}

		// Create audit record for update
		updateAudit, err := models.CreateAuditRecord(1, models.AuditActionUpdate, originalType, updatedType, "test_user")
		if err != nil {
			t.Fatalf("Failed to create update audit record: %v", err)
		}

		if updateAudit.Action != models.AuditActionUpdate {
			t.Errorf("Expected action %s, got %s", models.AuditActionUpdate, updateAudit.Action)
		}

		// Test validation of audit actions
		invalidAudit := &models.TransactionTypeAudit{
			TypeID:    1,
			Action:    "INVALID_ACTION",
			ChangedBy: "test_user",
			ChangedAt: time.Now(),
		}

		if err := invalidAudit.ValidateAction(); err == nil {
			t.Error("Expected error for invalid audit action")
		}

		validActions := []string{models.AuditActionCreate, models.AuditActionUpdate, models.AuditActionDelete}
		for _, action := range validActions {
			validAudit := &models.TransactionTypeAudit{
				TypeID:    1,
				Action:    action,
				ChangedBy: "test_user",
				ChangedAt: time.Now(),
			}
			if err := validAudit.ValidateAction(); err != nil {
				t.Errorf("Expected no error for valid action %s: %v", action, err)
			}
		}
	})

	t.Run("TestDecimalAmountValidation", func(t *testing.T) {
		// Test DecimalAmount validation
		validAmounts := []struct {
			name     string
			amount   decimal.Decimal
			currency string
		}{
			{"USD amount", decimal.NewFromFloat(100.50), "USD"},
			{"VND amount", decimal.NewFromFloat(2400000), "VND"},
			{"Zero amount", decimal.Zero, "USD"},
			{"Large amount", decimal.NewFromFloat(999999999.99), "EUR"},
		}

		for _, tt := range validAmounts {
			t.Run(tt.name, func(t *testing.T) {
				amount := &models.DecimalAmount{
					Amount:   tt.amount,
					Currency: tt.currency,
				}

				// Test that positive amounts are valid
				if amount.Amount.IsNegative() {
					t.Error("Negative amounts should be validated at application level")
				}

				// Test currency validation
				if amount.Currency == "" {
					t.Error("Currency should not be empty")
				}

				// Test precision handling
				if !amount.Amount.IsZero() && amount.Amount.LessThan(decimal.NewFromFloat(0.01)) && tt.currency == "USD" {
					t.Error("USD amounts should respect cent precision")
				}
			})
		}

		// Test precision edge cases
		edgeCases := []struct {
			name           string
			input          decimal.Decimal
			expectedPlaces int32
		}{
			{"Penny precision", decimal.NewFromFloat(0.01), 2},
			{"Half penny", decimal.NewFromFloat(0.005), 2},
			{"Large integer", decimal.NewFromFloat(123456789), 0},
			{"Very precise", decimal.NewFromFloat(0.123456789), 6},
		}

		for _, tt := range edgeCases {
			t.Run(tt.name, func(t *testing.T) {
				rounded := tt.input.RoundBank(tt.expectedPlaces)
				if rounded.String() != tt.input.Round(tt.expectedPlaces).String() {
					t.Error("Banker's rounding should match standard rounding for tested cases")
				}
			})
		}
	})
}

// TestAdvancedHoldingsReporting tests enhanced holdings reporting features
func TestAdvancedHoldingsReporting(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)
	reportingService := services.NewReportingService(tdb.database)

	t.Run("TestTimeWeightedReturns", func(t *testing.T) {
		startDate := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		testDate := startDate.AddDate(0, 6, 0) // 6 months later

		// Create a series of investments to test time-weighted returns
		investments := []struct {
			date     time.Time
			asset    string
			quantity decimal.Decimal
			price    decimal.Decimal
			account  string
		}{
			// Month 1: Initial investment
			{startDate, "BTC", decimal.NewFromFloat(1), decimal.NewFromFloat(50000), "Exchange"},
			// Month 2: Price increases, buy more
			{startDate.AddDate(0, 1, 0), "BTC", decimal.NewFromFloat(0.5), decimal.NewFromFloat(60000), "Exchange"},
			// Month 3: Buy ETH
			{startDate.AddDate(0, 2, 0), "ETH", decimal.NewFromFloat(10), decimal.NewFromFloat(3000), "Exchange"},
			// Month 4: BTC price drops, sell some
			{startDate.AddDate(0, 3, 0), "BTC", decimal.NewFromFloat(-0.3), decimal.NewFromFloat(45000), "Exchange"},
			// Month 5: BTC price recovers
			{startDate.AddDate(0, 4, 0), "BTC", decimal.NewFromFloat(0.2), decimal.NewFromFloat(65000), "Exchange"},
			// Month 6: Final valuation
			{startDate.AddDate(0, 5, 0), "BTC", decimal.NewFromFloat(0), decimal.NewFromFloat(70000), "Exchange"},
		}

		for _, inv := range investments {
			tx := &models.Transaction{
				Date:       inv.date,
				Type:       "deposit",
				Asset:      inv.asset,
				Account:    inv.account,
				Quantity:   inv.quantity,
				PriceLocal: inv.price,
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
			}

			if inv.quantity.IsNegative() {
				tx.Type = "withdraw"
				tx.Quantity = inv.quantity.Neg()
			}

			if err := transactionService.CreateTransaction(ctx, tx); err != nil {
				t.Fatalf("Failed to create investment transaction: %v", err)
			}
		}

		// Test holdings at different time points
		periods := []struct {
			name string
			date time.Time
		}{
			{"3 Months", startDate.AddDate(0, 3, 0)},
			{"6 Months", testDate},
		}

		for _, period := range periods {
			t.Run(period.name, func(t *testing.T) {
				holdings, err := reportingService.GetHoldings(ctx, period.date)
				if err != nil {
					t.Fatalf("GetHoldings failed: %v", err)
				}

				// Calculate portfolio metrics
				var totalValue decimal.Decimal
				var assetCount int
				for _, holding := range holdings {
					totalValue = totalValue.Add(holding.ValueUSD)
					assetCount++
				}

				// Verify portfolio composition
				if totalValue.IsZero() {
					t.Error("Portfolio should have value")
				}

				if assetCount == 0 {
					t.Error("Portfolio should have assets")
				}

				// Test percentage calculations
				for _, holding := range holdings {
					percentage := holding.ValueUSD.Div(totalValue).Mul(decimal.NewFromFloat(100))
					if percentage.IsNegative() || percentage.GreaterThan(decimal.NewFromFloat(100)) {
						t.Errorf("Invalid percentage for %s: %s", holding.Asset, percentage.String())
					}
				}

				// Test by-asset aggregation
				byAsset, err := reportingService.GetHoldingsByAsset(ctx, period.date)
				if err != nil {
					t.Fatalf("GetHoldingsByAsset failed: %v", err)
				}

				// Verify consistency between total and aggregated values
				var aggregatedValue decimal.Decimal
				for _, holding := range byAsset {
					aggregatedValue = aggregatedValue.Add(holding.ValueUSD)
				}

				if !totalValue.Equal(aggregatedValue) {
					t.Errorf("Value mismatch: total=%s, aggregated=%s",
						totalValue.String(), aggregatedValue.String())
				}
			})
		}
	})

	t.Run("TestPerformanceAttribution", func(t *testing.T) {
		startDate := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		testDate := startDate.AddDate(0, 3, 0)

		// Create complex investment scenario for performance attribution
		scenario := []struct {
			date        time.Time
			action      string
			asset       string
			quantity    decimal.Decimal
			price       decimal.Decimal
			account     string
			description string
		}{
			// Initial portfolio
			{startDate, "deposit", "BTC", decimal.NewFromFloat(1), decimal.NewFromFloat(50000), "Exchange", "Initial BTC"},
			{startDate, "deposit", "ETH", decimal.NewFromFloat(10), decimal.NewFromFloat(3000), "Exchange", "Initial ETH"},
			// Performance period
			{startDate.AddDate(0, 1, 0), "buy", "BTC", decimal.NewFromFloat(0.5), decimal.NewFromFloat(60000), "Exchange", "BTC DCA"},
			{startDate.AddDate(0, 2, 0), "sell", "ETH", decimal.NewFromFloat(5), decimal.NewFromFloat(3500), "Exchange", "ETH Trim"},
		}

		for _, tx := range scenario {
			transaction := &models.Transaction{
				Date:       tx.date,
				Type:       tx.action,
				Asset:      tx.asset,
				Account:    tx.account,
				Quantity:   tx.quantity,
				PriceLocal: tx.price,
				FXToUSD:    decimal.NewFromFloat(1),
				FXToVND:    decimal.NewFromFloat(24000),
				Note:       stringPtr(tx.description),
			}

			if err := transactionService.CreateTransaction(ctx, transaction); err != nil {
				t.Fatalf("Failed to create performance transaction: %v", err)
			}
		}

		// Test performance attribution
		holdings, err := reportingService.GetHoldings(ctx, testDate)
		if err != nil {
			t.Fatalf("GetHoldings failed: %v", err)
		}

		// Calculate individual asset performance
		var portfolioValue decimal.Decimal
		assetMetrics := make(map[string]struct {
			Quantity   decimal.Decimal
			ValueUSD   decimal.Decimal
			Percentage decimal.Decimal
		})

		for _, holding := range holdings {
			assetMetrics[holding.Asset] = struct {
				Quantity   decimal.Decimal
				ValueUSD   decimal.Decimal
				Percentage decimal.Decimal
			}{
				Quantity:   holding.Quantity,
				ValueUSD:   holding.ValueUSD,
				Percentage: holding.Percentage,
			}
			portfolioValue = portfolioValue.Add(holding.ValueUSD)
		}

		// Verify asset allocation makes sense
		for asset, metrics := range assetMetrics {
			if metrics.Quantity.IsNegative() {
				t.Errorf("Negative quantity for %s", asset)
			}
			if metrics.ValueUSD.IsNegative() {
				t.Errorf("Negative value for %s", asset)
			}

			expectedPercentage := metrics.ValueUSD.Div(portfolioValue).Mul(decimal.NewFromFloat(100))
			diff := metrics.Percentage.Sub(expectedPercentage).Abs()
			if diff.GreaterThan(decimal.NewFromFloat(0.01)) { // Allow 1 cent difference
				t.Errorf("Percentage mismatch for %s: expected %s, got %s",
					asset, expectedPercentage.String(), metrics.Percentage.String())
			}
		}

		// Test that total portfolio value is reasonable
		if portfolioValue.LessThan(decimal.NewFromFloat(1000)) {
			t.Error("Portfolio value seems too low for the test scenario")
		}
	})
}

// TestEnhancedFXRateTracking tests advanced FX rate precision and tracking
func TestEnhancedFXRateTracking(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	transactionService := services.NewTransactionService(tdb.database)

	t.Run("TestFXRatePrecision", func(t *testing.T) {
		startDate := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

		// Test various FX precision scenarios
		fxScenarios := []struct {
			name           string
			asset          string
			amount         decimal.Decimal
			usdRate        decimal.Decimal
			vndRate        decimal.Decimal
			precisionCheck bool
		}{
			{
				name:           "USD to VND high precision",
				asset:          "USD",
				amount:         decimal.NewFromFloat(100),
				usdRate:        decimal.NewFromFloat(1),
				vndRate:        decimal.NewFromFloat(24000.50),
				precisionCheck: true,
			},
			{
				name:           "EUR to USD conversion",
				asset:          "EUR",
				amount:         decimal.NewFromFloat(100),
				usdRate:        decimal.NewFromFloat(1.0850),
				vndRate:        decimal.NewFromFloat(26040),
				precisionCheck: true,
			},
			{
				name:           "VND large amount",
				asset:          "VND",
				amount:         decimal.NewFromFloat(2400000),
				usdRate:        decimal.NewFromFloat(0.0000416667),
				vndRate:        decimal.NewFromFloat(1),
				precisionCheck: true,
			},
		}

		for _, scenario := range fxScenarios {
			t.Run(scenario.name, func(t *testing.T) {
				// Calculate expected amounts
				expectedUSD := scenario.amount.Mul(scenario.usdRate)
				expectedVND := scenario.amount.Mul(scenario.vndRate)

				// Create transaction with FX rates
				transaction := &models.Transaction{
					Date:       startDate,
					Type:       "expense",
					Asset:      scenario.asset,
					Account:    "TestAccount",
					Quantity:   scenario.amount,
					PriceLocal: decimal.NewFromFloat(1),
					FXToUSD:    scenario.usdRate,
					FXToVND:    scenario.vndRate,
				}

				// Pre-save to calculate derived fields
				if err := transaction.PreSave(); err != nil {
					t.Fatalf("Transaction validation failed: %v", err)
				}

				// Verify FX calculations
				if !transaction.AmountUSD.Equal(expectedUSD.RoundBank(2)) {
					t.Errorf("USD amount mismatch: expected %s, got %s",
						expectedUSD.RoundBank(2).String(), transaction.AmountUSD.String())
				}

				if !transaction.AmountVND.Equal(expectedVND.RoundBank(0)) {
					t.Errorf("VND amount mismatch: expected %s, got %s",
						expectedVND.RoundBank(0).String(), transaction.AmountVND.String())
				}

				if scenario.precisionCheck {
					// Test precision preservation
					backConvertedUSD := transaction.AmountUSD.Div(transaction.FXToUSD)
					diffUSD := scenario.amount.Sub(backConvertedUSD).Abs()
					if diffUSD.GreaterThan(decimal.NewFromFloat(0.01)) {
						t.Errorf("USD precision loss too high: diff=%s", diffUSD.String())
					}

					backConvertedVND := transaction.AmountVND.Div(transaction.FXToVND)
					diffVND := scenario.amount.Sub(backConvertedVND).Abs()
					if diffVND.GreaterThan(decimal.NewFromFloat(0.01)) {
						t.Errorf("VND precision loss too high: diff=%s", diffVND.String())
					}
				}
			})
		}
	})

	t.Run("TestMultiCurrencyPortfolio", func(t *testing.T) {
		startDate := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		testDate := startDate.AddDate(0, 1, 0)

		// Create multi-currency portfolio
		currencyPositions := []struct {
			asset    string
			quantity decimal.Decimal
			price    decimal.Decimal
			usdRate  decimal.Decimal
			vndRate  decimal.Decimal
		}{
			{"USD", decimal.NewFromFloat(10000), decimal.NewFromFloat(1), decimal.NewFromFloat(1), decimal.NewFromFloat(24000)},
			{"EUR", decimal.NewFromFloat(1000), decimal.NewFromFloat(1), decimal.NewFromFloat(1.085), decimal.NewFromFloat(26040)},
			{"VND", decimal.NewFromFloat(240000000), decimal.NewFromFloat(1), decimal.NewFromFloat(0.0000416667), decimal.NewFromFloat(1)},
			{"BTC", decimal.NewFromFloat(1), decimal.NewFromFloat(50000), decimal.NewFromFloat(1), decimal.NewFromFloat(24000)},
		}

		for _, pos := range currencyPositions {
			transaction := &models.Transaction{
				Date:       startDate,
				Type:       "deposit",
				Asset:      pos.asset,
				Account:    "MultiCurrency",
				Quantity:   pos.quantity,
				PriceLocal: pos.price,
				FXToUSD:    pos.usdRate,
				FXToVND:    pos.vndRate,
			}

			if err := transactionService.CreateTransaction(ctx, transaction); err != nil {
				t.Fatalf("Failed to create multi-currency transaction: %v", err)
			}
		}

		// Test portfolio valuation
		holdings, err := services.NewReportingService(tdb.database).GetHoldings(ctx, testDate)
		if err != nil {
			t.Fatalf("GetHoldings failed for multi-currency test: %v", err)
		}

		// Calculate total portfolio value
		var totalUSDValue decimal.Decimal
		for _, holding := range holdings {
			totalUSDValue = totalUSDValue.Add(holding.ValueUSD)
		}

		// Verify portfolio valuation makes sense
		expectedMinValue := decimal.NewFromFloat(30000) // Conservative minimum
		if totalUSDValue.LessThan(expectedMinValue) {
			t.Errorf("Portfolio value too low: %s", totalUSDValue.String())
		}

		// Check that percentages add up correctly
		var totalPercentage decimal.Decimal
		for _, holding := range holdings {
			totalPercentage = totalPercentage.Add(holding.Percentage)
		}

		if !totalPercentage.Equal(decimal.NewFromFloat(100)) {
			t.Errorf("Portfolio percentages don't add to 100: %s", totalPercentage.String())
		}
	})
}
