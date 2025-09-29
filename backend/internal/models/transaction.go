package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// Transaction represents a single financial transaction
type Transaction struct {
	ID           string    `json:"id" db:"id"`
	Date         time.Time `json:"date" db:"date"`
	Type         string    `json:"type" db:"type"`
	Asset        string    `json:"asset" db:"asset"`
	Account      string    `json:"account" db:"account"`
	Counterparty *string   `json:"counterparty" db:"counterparty"`
	Tag          *string   `json:"tag" db:"tag"`
	Note         *string   `json:"note" db:"note"`

	// Amount fields
	Quantity    decimal.Decimal `json:"quantity" db:"quantity"`
	PriceLocal  decimal.Decimal `json:"price_local" db:"price_local"`
	AmountLocal decimal.Decimal `json:"amount_local" db:"amount_local"`

	// FX and dual currency
	FXToUSD   decimal.Decimal `json:"fx_to_usd" db:"fx_to_usd"`
	FXToVND   decimal.Decimal `json:"fx_to_vnd" db:"fx_to_vnd"`
	AmountUSD decimal.Decimal `json:"amount_usd" db:"amount_usd"`
	AmountVND decimal.Decimal `json:"amount_vnd" db:"amount_vnd"`

	// Fees
	FeeUSD decimal.Decimal `json:"fee_usd" db:"fee_usd"`
	FeeVND decimal.Decimal `json:"fee_vnd" db:"fee_vnd"`

	// Derived metrics
	DeltaQty    decimal.Decimal `json:"delta_qty" db:"delta_qty"`
	CashFlowUSD decimal.Decimal `json:"cashflow_usd" db:"cashflow_usd"`
	CashFlowVND decimal.Decimal `json:"cashflow_vnd" db:"cashflow_vnd"`

	// Optional tracking
	Horizon   *string          `json:"horizon" db:"horizon"`
	EntryDate *time.Time       `json:"entry_date" db:"entry_date"`
	ExitDate  *time.Time       `json:"exit_date" db:"exit_date"`
	FXImpact  *decimal.Decimal `json:"fx_impact" db:"fx_impact"`

	// Audit fields
	FXSource    *string    `json:"fx_source" db:"fx_source"`
	FXTimestamp *time.Time `json:"fx_timestamp" db:"fx_timestamp"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
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
	if t.FXToUSD.IsZero() {
		return errors.New("FX to USD rate is required")
	}
	if t.FXToVND.IsZero() {
		return errors.New("FX to VND rate is required")
	}

	// Validate horizon if provided
	if t.Horizon != nil && *t.Horizon != "short-term" && *t.Horizon != "long-term" {
		return errors.New("horizon must be 'short-term' or 'long-term'")
	}

	return nil
}

// CalculateDerivedFields calculates and sets the derived fields
func (t *Transaction) CalculateDerivedFields() {
	// Calculate AmountLocal
	t.AmountLocal = t.Quantity.Mul(t.PriceLocal)

	// Calculate USD/VND amounts
	t.AmountUSD = t.AmountLocal.Mul(t.FXToUSD)
	t.AmountVND = t.AmountLocal.Mul(t.FXToVND)

	// Calculate ΔQty based on transaction type
	switch t.Type {
	case "buy", "deposit", "transfer_in", "income", "reward", "airdrop", "lend", "repay", "interest":
		t.DeltaQty = t.Quantity
	case "sell", "withdraw", "transfer_out", "expense", "fee", "repay_borrow", "interest_expense":
		t.DeltaQty = t.Quantity.Neg()
	case "borrow":
		// Borrow increases cash/asset holdings in the receiving account
		// Liability tracking is handled separately via reporting
		t.DeltaQty = t.Quantity
	}

	// Calculate CashFlow based on transaction type and account
	if t.Account == "CreditCard" && t.Type == "expense" {
		// Credit card expense: no immediate cash flow
		t.CashFlowUSD = decimal.Zero
		t.CashFlowVND = decimal.Zero
	} else {
		switch t.Type {
		case "buy", "expense", "fee", "transfer_out", "lend", "repay_borrow", "interest_expense":
			t.CashFlowUSD = t.AmountUSD.Add(t.FeeUSD).Neg()
			t.CashFlowVND = t.AmountVND.Add(t.FeeVND).Neg()
		case "sell", "income", "reward", "airdrop", "transfer_in", "repay", "interest":
			t.CashFlowUSD = t.AmountUSD.Sub(t.FeeUSD)
			t.CashFlowVND = t.AmountVND.Sub(t.FeeVND)
		case "deposit", "withdraw", "borrow":
			// No net cash flow for deposits/withdrawals within same currency
			t.CashFlowUSD = decimal.Zero
			t.CashFlowVND = decimal.Zero
		}
	}
}

// PreSave prepares the transaction for saving by calculating derived fields and validating
func (t *Transaction) PreSave() error {
	t.CalculateDerivedFields()
	return t.Validate()
}
