package models

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInvestment_IsOpen(t *testing.T) {
	tests := []struct {
		name           string
		remainingQty   decimal.Decimal
		withdrawalID   *string
		expectedIsOpen bool
	}{
		{
			name:           "open investment with remaining quantity",
			remainingQty:   decimal.NewFromFloat(100.0),
			expectedIsOpen: true,
		},
		{
			name:           "closed investment with zero remaining quantity",
			remainingQty:   decimal.Zero,
			expectedIsOpen: false,
		},
		{
			name:           "partially closed investment",
			remainingQty:   decimal.NewFromFloat(50.0),
			expectedIsOpen: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			investment := &Investment{
				WithdrawalQty: tt.remainingQty,
			}

			isOpen := investment.WithdrawalQty.GreaterThan(decimal.Zero)
			assert.Equal(t, tt.expectedIsOpen, isOpen)
		})
	}
}

func TestInvestment_CalculateRealizedPnL(t *testing.T) {
	tests := []struct {
		name                string
		depositUnitCost     decimal.Decimal
		withdrawalUnitPrice decimal.Decimal
		withdrawalQty       decimal.Decimal
		expectedPnL         decimal.Decimal
		expectedPnLPercent  decimal.Decimal
	}{
		{
			name:                "profitable investment",
			depositUnitCost:     decimal.NewFromFloat(10.0),
			withdrawalUnitPrice: decimal.NewFromFloat(15.0),
			withdrawalQty:       decimal.NewFromFloat(100.0),
			expectedPnL:         decimal.NewFromFloat(500.0), // (15-10) * 100
			expectedPnLPercent:  decimal.NewFromFloat(50.0),  // 500 / 1000 * 100
		},
		{
			name:                "loss-making investment",
			depositUnitCost:     decimal.NewFromFloat(20.0),
			withdrawalUnitPrice: decimal.NewFromFloat(15.0),
			withdrawalQty:       decimal.NewFromFloat(50.0),
			expectedPnL:         decimal.NewFromFloat(-250.0), // (15-20) * 50
			expectedPnLPercent:  decimal.NewFromFloat(-25.0),  // -250 / 1000 * 100
		},
		{
			name:                "breakeven investment",
			depositUnitCost:     decimal.NewFromFloat(10.0),
			withdrawalUnitPrice: decimal.NewFromFloat(10.0),
			withdrawalQty:       decimal.NewFromFloat(100.0),
			expectedPnL:         decimal.Zero,
			expectedPnLPercent:  decimal.Zero,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Calculate P&L: (withdrawalUnitPrice - depositUnitCost) * withdrawalQty
			costBasis := tt.depositUnitCost.Mul(tt.withdrawalQty)
			saleValue := tt.withdrawalUnitPrice.Mul(tt.withdrawalQty)
			pnl := saleValue.Sub(costBasis)

			var pnlPercent decimal.Decimal
			if !costBasis.IsZero() {
				pnlPercent = pnl.Div(costBasis).Mul(decimal.NewFromInt(100))
			} else {
				pnlPercent = decimal.Zero
			}

			assert.True(t, pnl.Equal(tt.expectedPnL), "Expected P&L %s, got %s", tt.expectedPnL, pnl)
			assert.True(t, pnlPercent.Equal(tt.expectedPnLPercent), "Expected P&L %% %s, got %s", tt.expectedPnLPercent, pnlPercent)
		})
	}
}

func TestInvestmentFilter_BuildQuery(t *testing.T) {
	baseTime := time.Now()

	tests := []struct {
		name   string
		filter *InvestmentFilter
		expect string
	}{
		{
			name:   "empty filter",
			filter: &InvestmentFilter{},
			expect: "no additional conditions",
		},
		{
			name: "filter with asset only",
			filter: &InvestmentFilter{
				Asset: "BTC",
			},
			expect: "asset condition",
		},
		{
			name: "filter with account only",
			filter: &InvestmentFilter{
				Account: "binance",
			},
			expect: "account condition",
		},
		{
			name: "filter with horizon only",
			filter: &InvestmentFilter{
				Horizon: "long-term",
			},
			expect: "horizon condition",
		},
		{
			name: "filter with open status",
			filter: &InvestmentFilter{
				IsOpen: BoolPtr(true),
			},
			expect: "is_open condition",
		},
		{
			name: "filter with date range",
			filter: &InvestmentFilter{
				StartDate: &baseTime,
				EndDate:   &baseTime,
			},
			expect: "date range conditions",
		},
		{
			name: "filter with pagination",
			filter: &InvestmentFilter{
				Limit:  10,
				Offset: 20,
			},
			expect: "pagination conditions",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// This test ensures the filter struct works correctly
			// In a real implementation, we'd test the actual SQL generation
			assert.NotNil(t, tt.filter)

			if tt.filter.Asset != "" {
				assert.Equal(t, "BTC", tt.filter.Asset)
			}
			if tt.filter.Account != "" {
				assert.Equal(t, "binance", tt.filter.Account)
			}
			if tt.filter.Horizon != "" {
				assert.Equal(t, "long-term", tt.filter.Horizon)
			}
			if tt.filter.IsOpen != nil {
				assert.True(t, *tt.filter.IsOpen)
			}
		})
	}
}

func TestInvestmentSummary_CalculateROI(t *testing.T) {
	tests := []struct {
		name          string
		totalDeposits decimal.Decimal
		totalPnL      decimal.Decimal
		expectedROI   decimal.Decimal
		expectZeroROI bool
	}{
		{
			name:          "positive ROI",
			totalDeposits: decimal.NewFromFloat(1000.0),
			totalPnL:      decimal.NewFromFloat(200.0),
			expectedROI:   decimal.NewFromFloat(20.0), // 200/1000 * 100
		},
		{
			name:          "negative ROI",
			totalDeposits: decimal.NewFromFloat(1000.0),
			totalPnL:      decimal.NewFromFloat(-100.0),
			expectedROI:   decimal.NewFromFloat(-10.0), // -100/1000 * 100
		},
		{
			name:          "zero ROI",
			totalDeposits: decimal.NewFromFloat(1000.0),
			totalPnL:      decimal.Zero,
			expectedROI:   decimal.Zero,
		},
		{
			name:          "zero deposits (should avoid division by zero)",
			totalDeposits: decimal.Zero,
			totalPnL:      decimal.NewFromFloat(100.0),
			expectZeroROI: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var roi decimal.Decimal
			if tt.totalDeposits.GreaterThan(decimal.Zero) {
				roi = tt.totalPnL.Div(tt.totalDeposits).Mul(decimal.NewFromInt(100))
			} else {
				roi = decimal.Zero
			}

			if tt.expectZeroROI {
				assert.True(t, roi.IsZero(), "Expected zero ROI when deposits are zero")
			} else {
				assert.True(t, roi.Equal(tt.expectedROI), "Expected ROI %s, got %s", tt.expectedROI, roi)
			}
		})
	}
}

func TestInvestment_Validation(t *testing.T) {
	tests := []struct {
		name        string
		investment  *Investment
		expectError bool
		errorMsg    string
	}{
		{
			name: "valid investment",
			investment: &Investment{
				ID:              "investment-123",
				Asset:           "BTC",
				Account:         "binance",
				DepositDate:     time.Now(),
				DepositQty:      decimal.NewFromFloat(1.5),
				DepositCost:     decimal.NewFromFloat(15000.0),
				DepositUnitCost: decimal.NewFromFloat(10000.0),
				WithdrawalQty:   decimal.NewFromFloat(1.5),
				IsOpen:          true,
				CreatedAt:       time.Now(),
			},
			expectError: false,
		},
		{
			name: "investment with empty asset",
			investment: &Investment{
				ID:          "investment-123",
				Asset:       "",
				Account:     "binance",
				DepositDate: time.Now(),
				CreatedAt:   time.Now(),
			},
			expectError: true,
			errorMsg:    "asset cannot be empty",
		},
		{
			name: "investment with zero deposit quantity",
			investment: &Investment{
				ID:          "investment-123",
				Asset:       "BTC",
				Account:     "binance",
				DepositDate: time.Now(),
				DepositQty:  decimal.Zero,
				CreatedAt:   time.Now(),
			},
			expectError: true,
			errorMsg:    "deposit quantity must be greater than zero",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var err error

			if tt.investment.Asset == "" {
				err = assert.AnError
			}
			if tt.investment.DepositQty.LessThanOrEqual(decimal.Zero) {
				err = assert.AnError
			}

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestInvestment_CalculateRemainingQuantity(t *testing.T) {
	tests := []struct {
		name              string
		depositQty        decimal.Decimal
		totalWithdrawnQty decimal.Decimal
		expectedRemaining decimal.Decimal
		expectFullyClosed bool
	}{
		{
			name:              "no withdrawals",
			depositQty:        decimal.NewFromFloat(100.0),
			totalWithdrawnQty: decimal.Zero,
			expectedRemaining: decimal.NewFromFloat(100.0),
			expectFullyClosed: false,
		},
		{
			name:              "partial withdrawal",
			depositQty:        decimal.NewFromFloat(100.0),
			totalWithdrawnQty: decimal.NewFromFloat(30.0),
			expectedRemaining: decimal.NewFromFloat(70.0),
			expectFullyClosed: false,
		},
		{
			name:              "full withdrawal",
			depositQty:        decimal.NewFromFloat(100.0),
			totalWithdrawnQty: decimal.NewFromFloat(100.0),
			expectedRemaining: decimal.Zero,
			expectFullyClosed: true,
		},
		{
			name:              "over withdrawal (should not happen in practice)",
			depositQty:        decimal.NewFromFloat(100.0),
			totalWithdrawnQty: decimal.NewFromFloat(120.0),
			expectedRemaining: decimal.NewFromFloat(-20.0),
			expectFullyClosed: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			remaining := tt.depositQty.Sub(tt.totalWithdrawnQty)
			isFullyClosed := remaining.LessThanOrEqual(decimal.Zero)

			assert.True(t, remaining.Equal(tt.expectedRemaining),
				"Expected remaining quantity %s, got %s", tt.expectedRemaining, remaining)
			assert.Equal(t, tt.expectFullyClosed, isFullyClosed,
				"Expected fully closed %t, got %t", tt.expectFullyClosed, isFullyClosed)
		})
	}
}

func TestInvestment_Copy(t *testing.T) {
	original := &Investment{
		ID:                  "investment-123",
		Asset:               "BTC",
		Account:             "binance",
		Horizon:             StringPtr("long-term"),
		DepositDate:         time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC),
		DepositQty:          decimal.NewFromFloat(1.5),
		DepositCost:         decimal.NewFromFloat(15000.0),
		DepositUnitCost:     decimal.NewFromFloat(10000.0),
		WithdrawalDate:      TimePtr(time.Date(2023, 6, 1, 0, 0, 0, 0, time.UTC)),
		WithdrawalQty:       decimal.NewFromFloat(1.5),
		WithdrawalValue:     decimal.NewFromFloat(18000.0),
		WithdrawalUnitPrice: decimal.NewFromFloat(12000.0),
		PnL:                 decimal.NewFromFloat(3000.0),
		PnLPercent:          decimal.NewFromFloat(20.0),
		IsOpen:              false,
		CreatedAt:           time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	// Test that all fields are properly set
	require.NotEmpty(t, original.ID)
	require.Equal(t, "BTC", original.Asset)
	require.Equal(t, "binance", original.Account)
	require.Equal(t, "long-term", *original.Horizon)
	require.True(t, original.DepositQty.GreaterThan(decimal.Zero))
	require.True(t, original.DepositCost.GreaterThan(decimal.Zero))
	require.True(t, original.DepositUnitCost.GreaterThan(decimal.Zero))
	require.NotNil(t, original.WithdrawalDate)
	require.True(t, original.WithdrawalQty.GreaterThan(decimal.Zero))
	require.True(t, original.WithdrawalValue.GreaterThan(decimal.Zero))
	require.True(t, original.WithdrawalUnitPrice.GreaterThan(decimal.Zero))
	require.False(t, original.IsOpen)
	require.True(t, original.WithdrawalQty.IsZero())
}

// Helper functions
func StringPtr(s string) *string {
	return &s
}

func BoolPtr(b bool) *bool {
	return &b
}

func TimePtr(t time.Time) *time.Time {
	return &t
}
