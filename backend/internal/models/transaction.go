package models

import (
	"errors"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

// Transaction represents a single financial transaction
type Transaction struct {
	ID           string    `json:"id" gorm:"primaryKey;column:id;type:varchar(255);default:gen_random_uuid()"`
	Date         time.Time `json:"date" gorm:"column:date;type:timestamptz;not null;index"`
	Type         string    `json:"type" gorm:"column:type;type:varchar(50);not null;index"`
	Asset        string    `json:"asset" gorm:"column:asset;type:varchar(50);not null;index"`
	Account      string    `json:"account" gorm:"column:account;type:varchar(100);not null;index"`
	Counterparty *string   `json:"counterparty" gorm:"column:counterparty;type:varchar(255)"`
	Tag          *string   `json:"tag" gorm:"column:tag;type:varchar(255);index"`
	Note         *string   `json:"note" gorm:"column:note;type:text"`

	// Amount fields
	Quantity   decimal.Decimal `json:"quantity" gorm:"column:quantity;type:decimal(30,18);not null"`
	PriceLocal decimal.Decimal `json:"price_local" gorm:"column:price_local;type:decimal(30,18);not null"`

	// Amount fields
	AmountLocal   decimal.Decimal `json:"amount_local" gorm:"column:amount_local;type:decimal(30,18);not null"`
	LocalCurrency string          `json:"local_currency" gorm:"column:local_currency;type:varchar(10);not null;default:'USD'"`

	// Fees (stored in local currency, will be converted dynamically)
	FeeLocal decimal.Decimal `json:"fee_local" gorm:"column:fee_local;type:decimal(30,18);not null;default:0"`

	// Derived metrics
	DeltaQty    decimal.Decimal `json:"delta_qty" gorm:"column:delta_qty;type:decimal(30,18);not null"`
	CashFlowLocal decimal.Decimal `json:"cashflow_local" gorm:"column:cashflow_local;type:decimal(30,18);not null"`

	// Flow flags
	InternalFlow *bool `json:"internal_flow" gorm:"column:internal_flow;type:boolean;default:false"`

	// Enhanced investment tracking - links transaction to investment position
	InvestmentID *string `json:"investment_id" gorm:"column:investment_id;type:varchar(255);index"`

	// Optional tracking
	Horizon   *string          `json:"horizon" gorm:"column:horizon;type:varchar(20);index"`
	EntryDate *time.Time       `json:"entry_date" gorm:"column:entry_date;type:timestamptz;index"`
	ExitDate  *time.Time       `json:"exit_date" gorm:"column:exit_date;type:timestamptz;index"`
	FXImpact  *decimal.Decimal `json:"fx_impact" gorm:"column:fx_impact;type:decimal(30,18)"`

	// Borrow metadata (for type = 'borrow')
	BorrowAPR      *decimal.Decimal `json:"borrow_apr" gorm:"column:borrow_apr;type:decimal(10,8)"`
	BorrowTermDays *int             `json:"borrow_term_days" gorm:"column:borrow_term_days;type:integer"`
	BorrowActive   *bool            `json:"borrow_active" gorm:"column:borrow_active;type:boolean;default:true"`

	// Audit fields
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the Transaction model
func (Transaction) TableName() string {
	return "transactions"
}

// TransactionFilter represents filters for querying transactions
type TransactionFilter struct {
	StartDate    *time.Time
	EndDate      *time.Time
	Types        []string
	Assets       []string
	Accounts     []string
	Tags         []string
	Counterparty *string
	// Filter by linked investment ID when provided
	InvestmentID *string
	Limit        int
	Offset       int
}

// Validate validates the transaction data
func (t *Transaction) Validate() error {
	if t.Date.IsZero() {
		return errors.New("date is required")
	}
	if t.Type == "" {
		return errors.New("type is required")
	}
	if t.Asset == "" {
		return errors.New("asset is required")
	}
	if t.Account == "" {
		return errors.New("account is required")
	}
	if t.Quantity.IsZero() {
		return errors.New("quantity must be non-zero")
	}
	if t.PriceLocal.IsNegative() {
		return errors.New("price must be non-negative")
	}
	if t.LocalCurrency == "" {
		return errors.New("local currency is required")
	}

	// Validate borrow fields if provided
	if t.Type == "borrow" {
		if t.BorrowAPR != nil && t.BorrowAPR.IsNegative() {
			return errors.New("borrow_apr must be non-negative")
		}
		if t.BorrowTermDays != nil && *t.BorrowTermDays < 0 {
			return errors.New("borrow_term_days must be non-negative")
		}
	}

	// Validate horizon if provided
	if t.Horizon != nil && *t.Horizon != "short-term" && *t.Horizon != "long-term" {
		return errors.New("horizon must be 'short-term' or 'long-term'")
	}

	return nil
}

// CalculateDerivedFields calculates and sets the derived fields
func (t *Transaction) CalculateDerivedFields() {
	// Calculate amount in local currency
	t.AmountLocal = t.Quantity.Mul(t.PriceLocal)

	// Calculate ΔQty based on transaction type
	switch t.Type {
	case "buy", "deposit", "transfer_in", "income", "reward", "airdrop", "lend", "repay", "interest":
		t.DeltaQty = t.Quantity
	case "sell", "withdraw", "transfer_out", "expense", "fee", "repay_borrow", "interest_expense":
		t.DeltaQty = t.Quantity.Neg()
	case "valuation":
		t.DeltaQty = decimal.Zero
	case "borrow":
		// Borrow increases cash/asset holdings in the receiving account
		// Liability tracking is handled separately via reporting
		t.DeltaQty = t.Quantity
	}

	// Calculate CashFlow based on transaction type and account
	// Special cases: internal flows should not affect net cash flow
	if t.InternalFlow != nil && *t.InternalFlow && (t.Type == "buy" || t.Type == "sell" || t.Type == "transfer_in" || t.Type == "transfer_out") {
		// Zero out cash flow for internal trades/transfers between own accounts
		t.CashFlowLocal = decimal.Zero
		return
	}

	if t.Type == "valuation" {
		t.CashFlowLocal = decimal.Zero
		return
	}

	if t.Account == "CreditCard" && t.Type == "expense" {
		// Credit card expense: no immediate cash flow
		t.CashFlowLocal = decimal.Zero
	} else {
		switch t.Type {
		case "buy", "expense", "fee", "transfer_out", "lend", "repay_borrow", "interest_expense":
			t.CashFlowLocal = t.AmountLocal.Add(t.FeeLocal).Neg()
		case "sell", "income", "reward", "airdrop", "transfer_in", "repay", "interest":
			t.CashFlowLocal = t.AmountLocal.Sub(t.FeeLocal)
		case "deposit", "withdraw", "borrow":
			// No net cash flow for deposits/withdrawals within same currency
			t.CashFlowLocal = decimal.Zero
		}
	}
}

// GetConvertedAmounts returns the amounts converted to target currencies using provided FX rates
func (t *Transaction) GetConvertedAmounts(fxRates map[string]decimal.Decimal) (usdAmount, vndAmount, usdCashflow, vndCashflow decimal.Decimal) {
	if t.LocalCurrency == "USD" {
		usdAmount = t.AmountLocal
		vndAmount = t.AmountLocal.Mul(fxRates["USD-VND"])
		usdCashflow = t.CashFlowLocal
		vndCashflow = t.CashFlowLocal.Mul(fxRates["USD-VND"])
	} else if t.LocalCurrency == "VND" {
		usdAmount = t.AmountLocal.Mul(fxRates["VND-USD"])
		vndAmount = t.AmountLocal
		usdCashflow = t.CashFlowLocal.Mul(fxRates["VND-USD"])
		vndCashflow = t.CashFlowLocal
	} else {
		// For other currencies, convert through USD as base
		localToUSD := fxRates[t.LocalCurrency+"-USD"]
		localToVND := fxRates[t.LocalCurrency+"-VND"]
		usdAmount = t.AmountLocal.Mul(localToUSD)
		vndAmount = t.AmountLocal.Mul(localToVND)
		usdCashflow = t.CashFlowLocal.Mul(localToUSD)
		vndCashflow = t.CashFlowLocal.Mul(localToVND)
	}

	return usdAmount, vndAmount, usdCashflow, vndCashflow
}

// TransactionWithFX extends Transaction with dynamically calculated FX rates
type TransactionWithFX struct {
	Transaction
	FXRates map[string]decimal.Decimal `json:"fx_rates"` // Map of currency pairs to rates, e.g., "USD-VND": 24000
}

// GetAmountInCurrency returns the amount converted to the specified currency
func (tfx *TransactionWithFX) GetAmountInCurrency(targetCurrency string) decimal.Decimal {
	if tfx.LocalCurrency == targetCurrency {
		return tfx.AmountLocal
	}

	// Try direct conversion
	rateKey := fmt.Sprintf("%s-%s", tfx.LocalCurrency, targetCurrency)
	if rate, exists := tfx.FXRates[rateKey]; exists {
		return tfx.AmountLocal.Mul(rate)
	}

	// Try inverse conversion
	inverseKey := fmt.Sprintf("%s-%s", targetCurrency, tfx.LocalCurrency)
	if rate, exists := tfx.FXRates[inverseKey]; exists {
		return tfx.AmountLocal.Div(rate)
	}

	// No conversion rate available
	return decimal.Zero
}

// GetCashflowInCurrency returns the cashflow converted to the specified currency
func (tfx *TransactionWithFX) GetCashflowInCurrency(targetCurrency string) decimal.Decimal {
	if tfx.LocalCurrency == targetCurrency {
		return tfx.CashFlowLocal
	}

	// Try direct conversion
	rateKey := fmt.Sprintf("%s-%s", tfx.LocalCurrency, targetCurrency)
	if rate, exists := tfx.FXRates[rateKey]; exists {
		return tfx.CashFlowLocal.Mul(rate)
	}

	// Try inverse conversion
	inverseKey := fmt.Sprintf("%s-%s", targetCurrency, tfx.LocalCurrency)
	if rate, exists := tfx.FXRates[inverseKey]; exists {
		return tfx.CashflowLocal.Div(rate)
	}

	// No conversion rate available
	return decimal.Zero
}

// PreSave prepares the transaction for saving by calculating derived fields and validating
func (t *Transaction) PreSave() error {
	t.CalculateDerivedFields()
	return t.Validate()
}
