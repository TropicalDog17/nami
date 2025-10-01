package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// Investment represents a specific investment lot (deposit + any linked withdrawals)
type Investment struct {
	DepositID     string          `json:"deposit_id"`
	WithdrawalID  *string         `json:"withdrawal_id,omitempty"`
	Asset         string          `json:"asset"`
	Account       string          `json:"account"`
	Horizon       *string         `json:"horizon,omitempty"`

	// Deposit information
	DepositDate   time.Time       `json:"deposit_date"`
	DepositQty    decimal.Decimal `json:"deposit_qty"`
	DepositCost   decimal.Decimal `json:"deposit_cost"`
	DepositUnitCost decimal.Decimal `json:"deposit_unit_cost"`

	// Withdrawal information (if closed)
	WithdrawalDate    *time.Time     `json:"withdrawal_date,omitempty"`
	WithdrawalQty     decimal.Decimal `json:"withdrawal_qty"`
	WithdrawalValue   decimal.Decimal `json:"withdrawal_value"`
	WithdrawalUnitPrice decimal.Decimal `json:"withdrawal_unit_price"`

	// P&L calculation
	PnL            decimal.Decimal `json:"pnl"`
	PnLPercent     decimal.Decimal `json:"pnl_percent"`

	// Status
	IsOpen         bool            `json:"is_open"`
	RemainingQty   decimal.Decimal `json:"remaining_qty"`

	// Metadata
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// InvestmentFilter represents filters for querying investments
type InvestmentFilter struct {
	Asset         string
	Account       string
	Horizon       string
	IsOpen        *bool
	DepositID     string
	StartDate     *time.Time
	EndDate       *time.Time
	Limit         int
	Offset        int
}

// InvestmentSummary provides aggregated investment statistics
type InvestmentSummary struct {
	TotalInvestments   int             `json:"total_investments"`
	OpenInvestments    int             `json:"open_investments"`
	ClosedInvestments  int             `json:"closed_investments"`

	TotalDeposits      decimal.Decimal `json:"total_deposits"`
	TotalWithdrawals   decimal.Decimal `json:"total_withdrawals"`
	RealizedPnL        decimal.Decimal `json:"realized_pnl"`

	OpenMarketValue    decimal.Decimal `json:"open_market_value"`
	UnrealizedPnL      decimal.Decimal `json:"unrealized_pnl"`
	TotalPnL           decimal.Decimal `json:"total_pnl"`

	ROI                decimal.Decimal `json:"roi_percent"`
}