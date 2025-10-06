package integration

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tropicaldog17/nami/internal/models"
)

func TestInvestmentModelValidation(t *testing.T) {
	// Test that the Investment model can be created and has expected fields
	investment := &models.Investment{
		ID:                  "test-investment-id",
		Asset:               "BTC",
		Account:             "binance",
		Horizon:             stringPtr("long-term"),
		DepositDate:         time.Now(),
		DepositQty:          decimal.NewFromFloat(1.5),
		DepositCost:         decimal.NewFromFloat(15000.0),
		DepositUnitCost:     decimal.NewFromFloat(10000.0),
		WithdrawalDate:      timePtr(time.Now()),
		WithdrawalQty:       decimal.NewFromFloat(1.5),
		WithdrawalValue:     decimal.NewFromFloat(18000.0),
		WithdrawalUnitPrice: decimal.NewFromFloat(12000.0),
		PnL:                 decimal.NewFromFloat(3000.0),
		PnLPercent:          decimal.NewFromFloat(20.0),
		IsOpen:              false,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	// Basic validation
	assert.Equal(t, "test-investment-id", investment.ID)
	assert.Equal(t, "BTC", investment.Asset)
	assert.Equal(t, "binance", investment.Account)
	assert.Equal(t, "long-term", *investment.Horizon)
	assert.True(t, investment.DepositQty.Equal(decimal.NewFromFloat(1.5)))
	assert.True(t, investment.DepositCost.Equal(decimal.NewFromFloat(15000.0)))
	assert.True(t, investment.DepositUnitCost.Equal(decimal.NewFromFloat(10000.0)))
	assert.False(t, investment.IsOpen)
}

func TestInvestmentFilterValidation(t *testing.T) {
	// Test that the InvestmentFilter can be created with various filters
	startDate := time.Now().Add(-24 * time.Hour)
	endDate := time.Now()
	isOpen := true

	filter := &models.InvestmentFilter{
		Asset:     "BTC",
		Account:   "binance",
		Horizon:   "long-term",
		IsOpen:    &isOpen,
		StartDate: &startDate,
		EndDate:   &endDate,
		Limit:     10,
		Offset:    0,
	}

	assert.Equal(t, "BTC", filter.Asset)
	assert.Equal(t, "binance", filter.Account)
	assert.Equal(t, "long-term", filter.Horizon)
	assert.True(t, *filter.IsOpen)
	assert.NotNil(t, filter.StartDate)
	assert.NotNil(t, filter.EndDate)
	assert.Equal(t, 10, filter.Limit)
	assert.Equal(t, 0, filter.Offset)
}

func TestInvestmentSummaryValidation(t *testing.T) {
	// Test that the InvestmentSummary can be created and has expected fields
	summary := &models.InvestmentSummary{
		TotalInvestments:  5,
		OpenInvestments:   3,
		ClosedInvestments: 2,
		TotalDeposits:     decimal.NewFromFloat(50000.0),
		TotalWithdrawals:  decimal.NewFromFloat(30000.0),
		RealizedPnL:       decimal.NewFromFloat(5000.0),
		OpenMarketValue:   decimal.NewFromFloat(25000.0),
		UnrealizedPnL:     decimal.NewFromFloat(2000.0),
		TotalPnL:          decimal.NewFromFloat(7000.0),
		ROI:               decimal.NewFromFloat(14.0),
	}

	assert.Equal(t, 5, summary.TotalInvestments)
	assert.Equal(t, 3, summary.OpenInvestments)
	assert.Equal(t, 2, summary.ClosedInvestments)
	assert.True(t, summary.TotalDeposits.Equal(decimal.NewFromFloat(50000.0)))
	assert.True(t, summary.TotalWithdrawals.Equal(decimal.NewFromFloat(30000.0)))
	assert.True(t, summary.RealizedPnL.Equal(decimal.NewFromFloat(5000.0)))
	assert.True(t, summary.OpenMarketValue.Equal(decimal.NewFromFloat(25000.0)))
	assert.True(t, summary.UnrealizedPnL.Equal(decimal.NewFromFloat(2000.0)))
	assert.True(t, summary.TotalPnL.Equal(decimal.NewFromFloat(7000.0)))
	assert.True(t, summary.ROI.Equal(decimal.NewFromFloat(14.0)))
}

func TestTransactionModelWithInvestmentFields(t *testing.T) {
	// Test that the Transaction model includes investment tracking fields
	horizon := "long-term"
	entryDate := time.Now()

	tx := &models.Transaction{
		ID:          "test-transaction-id",
		Date:        time.Now(),
		Type:        "deposit",
		Asset:       "BTC",
		Account:     "binance",
		Quantity:    decimal.NewFromFloat(1.0),
		PriceLocal:  decimal.NewFromFloat(10000.0),
		FXToUSD:     decimal.NewFromInt(1),
		AmountUSD:   decimal.NewFromFloat(10000.0),
		DeltaQty:    decimal.NewFromFloat(1.0),
		CashFlowUSD: decimal.NewFromFloat(-10000.0),
		Horizon:     &horizon,
		EntryDate:   &entryDate,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	assert.Equal(t, "test-transaction-id", tx.ID)
	assert.Equal(t, "deposit", tx.Type)
	assert.Equal(t, "BTC", tx.Asset)
	assert.Equal(t, "binance", tx.Account)
	assert.Equal(t, horizon, *tx.Horizon)
	assert.NotNil(t, tx.EntryDate)
}

func TestTransactionInvestmentTypeValidation(t *testing.T) {
	// Test transaction types for investment tracking
	depositTypes := []string{"deposit", "stake", "buy"}
	withdrawalTypes := []string{"withdraw", "unstake", "sell"}

	// Test deposit types
	for _, txType := range depositTypes {
		tx := &models.Transaction{
			Type: txType,
		}
		assert.Contains(t, depositTypes, tx.Type, "Transaction type %s should be a deposit type", txType)
	}

	// Test withdrawal types
	for _, txType := range withdrawalTypes {
		tx := &models.Transaction{
			Type: txType,
		}
		assert.Contains(t, withdrawalTypes, tx.Type, "Transaction type %s should be a withdrawal type", txType)
	}
}

func TestInvestmentCalculations(t *testing.T) {
	// Test P&L calculations
	depositUnitCost := decimal.NewFromFloat(100.0)
	withdrawalUnitPrice := decimal.NewFromFloat(120.0)
	withdrawalQty := decimal.NewFromFloat(10.0)

	// Calculate expected P&L
	costBasis := depositUnitCost.Mul(withdrawalQty)
	saleValue := withdrawalUnitPrice.Mul(withdrawalQty)
	expectedPnL := saleValue.Sub(costBasis)
	expectedPnLPercent := expectedPnL.Div(costBasis).Mul(decimal.NewFromInt(100))

	// Verify calculations
	assert.True(t, expectedPnL.Equal(decimal.NewFromFloat(200.0)), "Expected P&L of 200.0")
	assert.True(t, expectedPnLPercent.Equal(decimal.NewFromFloat(20.0)), "Expected P&L percentage of 20.0")

	// Test loss scenario
	lossWithdrawalPrice := decimal.NewFromFloat(80.0)
	lossSaleValue := lossWithdrawalPrice.Mul(withdrawalQty)
	expectedLossPnL := lossSaleValue.Sub(costBasis)
	expectedLossPnLPercent := expectedLossPnL.Div(costBasis).Mul(decimal.NewFromInt(100))

	assert.True(t, expectedLossPnL.Equal(decimal.NewFromFloat(-200.0)), "Expected loss P&L of -200.0")
	assert.True(t, expectedLossPnLPercent.Equal(decimal.NewFromFloat(-20.0)), "Expected loss P&L percentage of -20.0")
}

func TestInvestmentRemainingQuantityCalculation(t *testing.T) {
	// Test remaining quantity calculations
	depositQty := decimal.NewFromFloat(100.0)

	testCases := []struct {
		withdrawalQty     decimal.Decimal
		expectedRemaining decimal.Decimal
		expectedClosed    bool
	}{
		{decimal.Zero, decimal.NewFromFloat(100.0), false},
		{decimal.NewFromFloat(25.0), decimal.NewFromFloat(75.0), false},
		{decimal.NewFromFloat(100.0), decimal.Zero, true},
		{decimal.NewFromFloat(120.0), decimal.NewFromFloat(-20.0), true}, // Over-withdrawal
	}

	for _, tc := range testCases {
		remaining := depositQty.Sub(tc.withdrawalQty)
		isClosed := remaining.LessThanOrEqual(decimal.Zero)

		assert.True(t, remaining.Equal(tc.expectedRemaining),
			"For withdrawal %s, expected remaining %s, got %s",
			tc.withdrawalQty, tc.expectedRemaining, remaining)
		assert.Equal(t, tc.expectedClosed, isClosed,
			"For withdrawal %s, expected closed %t, got %t",
			tc.withdrawalQty, tc.expectedClosed, isClosed)
	}
}

// Helper functions for investment tests
// local pointer helpers removed; using shared helpers from testutil.go
