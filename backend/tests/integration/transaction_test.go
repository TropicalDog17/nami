package integration

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

func TestTransactionValidation(t *testing.T) {
	tests := []struct {
		name        string
		transaction models.Transaction
		wantErr     bool
		errContains string
	}{
		{
			name: "valid transaction",
			transaction: models.Transaction{
				Date:       time.Now(),
				Type:       "buy",
				Asset:      "BTC",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			wantErr: false,
		},
		{
			name: "missing date",
			transaction: models.Transaction{
				Type:       "buy",
				Asset:      "BTC",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			wantErr:     true,
			errContains: "date is required",
		},
		{
			name: "missing type",
			transaction: models.Transaction{
				Date:       time.Now(),
				Asset:      "BTC",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			wantErr:     true,
			errContains: "type is required",
		},
		{
			name: "zero quantity",
			transaction: models.Transaction{
				Date:       time.Now(),
				Type:       "buy",
				Asset:      "BTC",
				Account:    "Exchange",
				Quantity:   decimal.Zero,
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			wantErr:     true,
			errContains: "quantity must be non-zero",
		},
		{
			name: "negative price",
			transaction: models.Transaction{
				Date:       time.Now(),
				Type:       "buy",
				Asset:      "BTC",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(-50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
			},
			wantErr:     true,
			errContains: "price must be non-negative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.transaction.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() expected error but got none")
					return
				}
				if tt.errContains != "" && err.Error() != tt.errContains {
					t.Errorf("Validate() error = %v, want error containing %v", err, tt.errContains)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() unexpected error = %v", err)
				}
			}
		})
	}
}

func TestCalculateDerivedFields(t *testing.T) {
	tests := []struct {
		name            string
		transaction     models.Transaction
		wantDeltaQty    decimal.Decimal
		wantCashFlowUSD decimal.Decimal
	}{
		{
			name: "buy transaction",
			transaction: models.Transaction{
				Type:       "buy",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
				FeeUSD:     decimal.NewFromFloat(10),
				FeeVND:     decimal.NewFromFloat(240000),
			},
			wantDeltaQty:    decimal.NewFromFloat(1.0),
			wantCashFlowUSD: decimal.NewFromFloat(-50010), // -(amount + fee)
		},
		{
			name: "sell transaction",
			transaction: models.Transaction{
				Type:       "sell",
				Account:    "Exchange",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(50000),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
				FeeUSD:     decimal.NewFromFloat(10),
				FeeVND:     decimal.NewFromFloat(240000),
			},
			wantDeltaQty:    decimal.NewFromFloat(-1.0),
			wantCashFlowUSD: decimal.NewFromFloat(49990), // amount - fee
		},
		{
			name: "credit card expense",
			transaction: models.Transaction{
				Type:       "expense",
				Account:    "CreditCard",
				Quantity:   decimal.NewFromFloat(1.0),
				PriceLocal: decimal.NewFromFloat(100),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromFloat(24000),
				FeeUSD:     decimal.Zero,
				FeeVND:     decimal.Zero,
			},
			wantDeltaQty:    decimal.NewFromFloat(-1.0),
			wantCashFlowUSD: decimal.Zero, // No immediate cash flow for credit card
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.transaction.CalculateDerivedFields()

			if !tt.transaction.DeltaQty.Equal(tt.wantDeltaQty) {
				t.Errorf("CalculateDerivedFields() DeltaQty = %v, want %v",
					tt.transaction.DeltaQty, tt.wantDeltaQty)
			}

			if !tt.transaction.CashFlowUSD.Equal(tt.wantCashFlowUSD) {
				t.Errorf("CalculateDerivedFields() CashFlowUSD = %v, want %v",
					tt.transaction.CashFlowUSD, tt.wantCashFlowUSD)
			}
		})
	}
}
