package models

import (
	"errors"
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

	// FX and dual currency
	AmountLocal decimal.Decimal `json:"amount_local" gorm:"column:amount_local;type:decimal(30,18);not null"`
	FXToUSD     decimal.Decimal `json:"fx_to_usd" gorm:"column:fx_to_usd;type:decimal(30,18);not null"`
	FXToVND     decimal.Decimal `json:"fx_to_vnd" gorm:"column:fx_to_vnd;type:decimal(30,18);not null"`
	AmountUSD   decimal.Decimal `json:"amount_usd" gorm:"column:amount_usd;type:decimal(30,18);not null"`
	AmountVND   decimal.Decimal `json:"amount_vnd" gorm:"column:amount_vnd;type:decimal(30,18);not null"`

	// Fees
	FeeUSD decimal.Decimal `json:"fee_usd" gorm:"column:fee_usd;type:decimal(30,18);not null;default:0"`
	FeeVND decimal.Decimal `json:"fee_vnd" gorm:"column:fee_vnd;type:decimal(30,18);not null;default:0"`

	// Derived metrics
	DeltaQty    decimal.Decimal `json:"delta_qty" gorm:"column:delta_qty;type:decimal(30,18);not null"`
	CashFlowUSD decimal.Decimal `json:"cashflow_usd" gorm:"column:cashflow_usd;type:decimal(30,18);not null"`
	CashFlowVND decimal.Decimal `json:"cashflow_vnd" gorm:"column:cashflow_vnd;type:decimal(30,18);not null"`

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
	FXSource    *string    `json:"fx_source" gorm:"column:fx_source;type:varchar(50)"`
	FXTimestamp *time.Time `json:"fx_timestamp" gorm:"column:fx_timestamp;type:timestamptz"`
	CreatedAt   time.Time  `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt   time.Time  `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
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
	// Calculate USD/VND amounts
	// First compute amount in local currency so downstream fields can rely on it
	t.AmountLocal = t.Quantity.Mul(t.PriceLocal)
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
	// Special cases: internal flows should not affect net cash flow
	if t.InternalFlow != nil && *t.InternalFlow && (t.Type == "buy" || t.Type == "sell" || t.Type == "transfer_in" || t.Type == "transfer_out") {
		// Zero out cash flow for internal trades/transfers between own accounts
		t.CashFlowUSD = decimal.Zero
		t.CashFlowVND = decimal.Zero
		return
	}

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
