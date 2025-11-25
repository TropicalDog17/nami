package models

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestTransactionWithLocalCurrency(t *testing.T) {
	tests := []struct {
		name          string
		transaction   *Transaction
		expectError   bool
		expectedError string
	}{
		{
			name: "Valid USD transaction without FX rates",
			transaction: &Transaction{
				Date:          time.Now(),
				Type:          "expense",
				Asset:         "USD",
				Account:       "Bank",
				Quantity:      decimal.NewFromFloat(100),
				PriceLocal:    decimal.NewFromFloat(1),
				LocalCurrency: "USD",
			},
			expectError: false,
		},
		{
			name: "Valid VND transaction without FX rates",
			transaction: &Transaction{
				Date:          time.Now(),
				Type:          "expense",
				Asset:         "VND",
				Account:       "Bank",
				Quantity:      decimal.NewFromFloat(100000),
				PriceLocal:    decimal.NewFromFloat(1),
				LocalCurrency: "VND",
			},
			expectError: false,
		},
		{
			name: "Valid transaction with FX rates provided",
			transaction: &Transaction{
				Date:          time.Now(),
				Type:          "expense",
				Asset:         "USD",
				Account:       "Bank",
				Quantity:      decimal.NewFromFloat(100),
				PriceLocal:    decimal.NewFromFloat(1),
				LocalCurrency: "USD",
				FXToUSD:       decimal.NewFromInt(1),
				FXToVND:       decimal.NewFromFloat(23500),
			},
			expectError: false,
		},
		{
			name: "Invalid transaction - missing LocalCurrency",
			transaction: &Transaction{
				Date:       time.Now(),
				Type:       "expense",
				Asset:      "USD",
				Account:    "Bank",
				Quantity:   decimal.NewFromFloat(100),
				PriceLocal: decimal.NewFromFloat(1),
			},
			expectError:   true,
			expectedError: "local_currency is required",
		},
		{
			name: "Invalid transaction - zero quantity",
			transaction: &Transaction{
				Date:          time.Now(),
				Type:          "expense",
				Asset:         "USD",
				Account:       "Bank",
				Quantity:      decimal.Zero,
				PriceLocal:    decimal.NewFromFloat(1),
				LocalCurrency: "USD",
			},
			expectError:   true,
			expectedError: "quantity must be non-zero",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.transaction.Validate()

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if tt.expectedError != "" && err.Error() != tt.expectedError {
					t.Errorf("Expected error '%s' but got '%s'", tt.expectedError, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
				}
			}
		})
	}
}

func TestTransactionCalculateDerivedFields(t *testing.T) {
	tests := []struct {
		name               string
		transaction       *Transaction
		expectedAmountUSD decimal.Decimal
		expectedAmountVND decimal.Decimal
	}{
		{
			name: "USD transaction without FX rates",
			transaction: &Transaction{
				Quantity:      decimal.NewFromFloat(100),
				PriceLocal:    decimal.NewFromFloat(1.5),
				LocalCurrency: "USD",
				Type:          "expense",
				Asset:         "USD",
			},
			expectedAmountUSD: decimal.Zero, // No FX rate, so should be zero
			expectedAmountVND: decimal.Zero, // No FX rate, so should be zero
		},
		{
			name: "VND transaction without FX rates",
			transaction: &Transaction{
				Quantity:      decimal.NewFromFloat(100000),
				PriceLocal:    decimal.NewFromFloat(15000),
				LocalCurrency: "VND",
				Type:          "expense",
				Asset:         "VND",
			},
			expectedAmountUSD: decimal.Zero, // No FX rate, so should be zero
			expectedAmountVND: decimal.Zero, // No FX rate, so should be zero
		},
		{
			name: "USD transaction with FX rates",
			transaction: &Transaction{
				Quantity:      decimal.NewFromFloat(100),
				PriceLocal:    decimal.NewFromFloat(1.5),
				LocalCurrency: "USD",
				Type:          "expense",
				Asset:         "USD",
				FXToUSD:       decimal.NewFromInt(1),
				FXToVND:       decimal.NewFromFloat(23500),
			},
			expectedAmountUSD: decimal.NewFromFloat(150), // 100 * 1.5 * 1
			expectedAmountVND: decimal.NewFromFloat(3525000), // 100 * 1.5 * 23500
		},
		{
			name: "VND transaction with FX rates",
			transaction: &Transaction{
				Quantity:      decimal.NewFromFloat(100000),
				PriceLocal:    decimal.NewFromFloat(15000),
				LocalCurrency: "VND",
				Type:          "expense",
				Asset:         "VND",
				FXToUSD:       decimal.NewFromFloat(0.0000425531914893617),
				FXToVND:       decimal.NewFromInt(1),
			},
			expectedAmountUSD: decimal.NewFromFloat(63829.78723404255), // 100000 * 15000 * 0.0000425531914893617 = 63829.78723404255
			expectedAmountVND: decimal.NewFromFloat(1500000000), // 100000 * 15000 * 1
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.transaction.CalculateDerivedFields()

			if !tt.transaction.AmountUSD.Equal(tt.expectedAmountUSD) {
				t.Errorf("Expected AmountUSD %s but got %s", tt.expectedAmountUSD.String(), tt.transaction.AmountUSD.String())
			}
			if !tt.transaction.AmountVND.Equal(tt.expectedAmountVND) {
				t.Errorf("Expected AmountVND %s but got %s", tt.expectedAmountVND.String(), tt.transaction.AmountVND.String())
			}
		})
	}
}