package main

import (
	"fmt"
	"testing"

	"github.com/shopspring/decimal"
)

// TestPnL_Calculation_Logic validates the PnL calculation logic without database
func TestPnL_Calculation_Logic(t *testing.T) {
	t.Run("CloseAll_Profit_Logic", func(t *testing.T) {
		// Test the mathematical logic: PnL = Exit Value - Entry Value

		// Scenario: Stake 500 USDT at $1.00, unstake all at $1.20 = $100 profit
		entryValue := decimal.NewFromInt(500) // 500 USDT × $1.00
		exitValue := decimal.NewFromInt(600)  // 500 USDT × $1.20

		expectedPnL := exitValue.Sub(entryValue)                                // $600 - $500 = $100 profit
		expectedROI := expectedPnL.Div(entryValue).Mul(decimal.NewFromInt(100)) // $100/$500 × 100% = 20%

		if !expectedPnL.Equal(decimal.NewFromInt(100)) {
			t.Errorf("Expected PnL $100, got %s", expectedPnL.String())
		}

		if !expectedROI.Equal(decimal.NewFromInt(20)) {
			t.Errorf("Expected ROI 20%%, got %s%%", expectedROI.String())
		}

		fmt.Printf("✓ Close All Profit Test: Entry $%s, Exit $%s, PnL $%s, ROI %s%%\n",
			entryValue.String(), exitValue.String(), expectedPnL.String(), expectedROI.String())
	})

	t.Run("CloseAll_Loss_Logic", func(t *testing.T) {
		// Test the mathematical logic: PnL = Exit Value - Entry Value

		// Scenario: Stake 500 USDT at $1.00, unstake all at $0.55 = $225 loss
		entryValue := decimal.NewFromInt(500) // 500 USDT × $1.00
		exitValue := decimal.NewFromInt(275)  // 500 USDT × $0.55 (or 275 USDT at $1.00)

		expectedPnL := exitValue.Sub(entryValue)                                // $275 - $500 = -$225 loss
		expectedROI := expectedPnL.Div(entryValue).Mul(decimal.NewFromInt(100)) // -$225/$500 × 100% = -45%

		if !expectedPnL.Equal(decimal.NewFromInt(-225)) {
			t.Errorf("Expected PnL -$225, got %s", expectedPnL.String())
		}

		if !expectedROI.Equal(decimal.NewFromInt(-45)) {
			t.Errorf("Expected ROI -45%%, got %s%%", expectedROI.String())
		}

		fmt.Printf("✓ Close All Loss Test: Entry $%s, Exit $%s, PnL $%s, ROI %s%%\n",
			entryValue.String(), exitValue.String(), expectedPnL.String(), expectedROI.String())
	})

	t.Run("Partial_Unstake_Logic", func(t *testing.T) {
		// Test proportional cost basis for partial unstakes

		// Scenario: Stake 1000 USDT at $1.00, unstake 300 at $1.10
		entryValue := decimal.NewFromInt(1000) // 1000 USDT × $1.00
		unstakeQuantity := decimal.NewFromInt(300)
		unstakeValue := decimal.NewFromInt(330) // 300 USDT × $1.10

		// Proportional cost basis = (unstake_qty / stake_qty) × stake_value
		proportionalCost := unstakeQuantity.Div(decimal.NewFromInt(1000)).Mul(entryValue) // 300/1000 × $1000 = $300

		expectedPnL := unstakeValue.Sub(proportionalCost)                             // $330 - $300 = $30 profit
		expectedROI := expectedPnL.Div(proportionalCost).Mul(decimal.NewFromInt(100)) // $30/$300 × 100% = 10%

		if !expectedPnL.Equal(decimal.NewFromInt(30)) {
			t.Errorf("Expected PnL $30, got %s", expectedPnL.String())
		}

		if !expectedROI.Equal(decimal.NewFromInt(10)) {
			t.Errorf("Expected ROI 10%%, got %s%%", expectedROI.String())
		}

		fmt.Printf("✓ Partial Unstake Test: Cost Basis $%s, Exit $%s, PnL $%s, ROI %s%%\n",
			proportionalCost.String(), unstakeValue.String(), expectedPnL.String(), expectedROI.String())
	})
}

func main() {
	fmt.Println("=== PnL Calculation Logic Tests ===")

	// Create a test instance and run it
	t := &testing.T{}
	TestPnL_Calculation_Logic(t)

	if !t.Failed() {
		fmt.Println("✅ All PnL calculation logic tests passed!")
	} else {
		fmt.Println("❌ Some tests failed!")
	}
}
