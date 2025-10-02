package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// CostBasisMethod represents different cost basis calculation methods
type CostBasisMethod string

const (
	CostBasisFIFO    CostBasisMethod = "fifo"
	CostBasisLIFO    CostBasisMethod = "lifo"
	CostBasisAverage CostBasisMethod = "average"
)

// Investment represents a specific investment position that can have multiple deposits
type Investment struct {
	ID           string          `json:"id" db:"id"`
	Asset        string          `json:"asset" db:"asset"`
	Account      string          `json:"account" db:"account"`
	Horizon      *string         `json:"horizon,omitempty" db:"horizon"`

	// Aggregated deposit information
	DepositDate      time.Time       `json:"deposit_date" db:"deposit_date"`      // First deposit date
	DepositQty       decimal.Decimal `json:"deposit_qty" db:"deposit_qty"`        // Total quantity deposited
	DepositCost      decimal.Decimal `json:"deposit_cost" db:"deposit_cost"`      // Total cost in USD
	DepositUnitCost  decimal.Decimal `json:"deposit_unit_cost" db:"deposit_unit_cost"` // Weighted average unit cost

	// Withdrawal information (if closed)
	WithdrawalDate     *time.Time     `json:"withdrawal_date,omitempty" db:"withdrawal_date"`
	WithdrawalQty      decimal.Decimal `json:"withdrawal_qty" db:"withdrawal_qty"`
	WithdrawalValue    decimal.Decimal `json:"withdrawal_value" db:"withdrawal_value"`
	WithdrawalUnitPrice decimal.Decimal `json:"withdrawal_unit_price" db:"withdrawal_unit_price"`

	// P&L calculation
	PnL        decimal.Decimal `json:"pnl" db:"pnl"`
	PnLPercent decimal.Decimal `json:"pnl_percent" db:"pnl_percent"`

	// Status and quantities
	IsOpen       bool            `json:"is_open" db:"is_open"`
	RemainingQty decimal.Decimal `json:"remaining_qty" db:"remaining_qty"`

	// Configuration
	CostBasisMethod CostBasisMethod `json:"cost_basis_method" db:"cost_basis_method"`

	// Metadata
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// InvestmentFilter represents filters for querying investments
type InvestmentFilter struct {
	Asset           string
	Account         string
	Horizon         string
	IsOpen          *bool
	CostBasisMethod CostBasisMethod
	StartDate       *time.Time
	EndDate         *time.Time
	Limit           int
	Offset          int
}

// InvestmentSummary provides aggregated investment statistics
type InvestmentSummary struct {
	TotalInvestments  int             `json:"total_investments"`
	OpenInvestments   int             `json:"open_investments"`
	ClosedInvestments int             `json:"closed_investments"`

	TotalDeposits     decimal.Decimal `json:"total_deposits"`
	TotalWithdrawals  decimal.Decimal `json:"total_withdrawals"`
	RealizedPnL       decimal.Decimal `json:"realized_pnl"`

	OpenMarketValue   decimal.Decimal `json:"open_market_value"`
	UnrealizedPnL     decimal.Decimal `json:"unrealized_pnl"`
	TotalPnL          decimal.Decimal `json:"total_pnl"`

	ROI               decimal.Decimal `json:"roi_percent"`
}

// Validate validates the investment data
func (i *Investment) Validate() error {
	if i.Asset == "" {
		return errors.New("asset is required")
	}
	if i.Account == "" {
		return errors.New("account is required")
	}
	if i.DepositDate.IsZero() {
		return errors.New("deposit date is required")
	}
	if i.DepositQty.IsZero() || i.DepositQty.IsNegative() {
		return errors.New("deposit quantity must be positive")
	}
	if i.DepositCost.IsNegative() {
		return errors.New("deposit cost cannot be negative")
	}
	if i.DepositUnitCost.IsNegative() {
		return errors.New("deposit unit cost cannot be negative")
	}
	if i.CostBasisMethod == "" {
		i.CostBasisMethod = CostBasisFIFO // Default to FIFO
	}
	return nil
}

// IsFullyWithdrawn checks if the investment has been completely closed
func (i *Investment) IsFullyWithdrawn() bool {
	return !i.IsOpen && i.RemainingQty.IsZero()
}

// CalculateRemainingQuantity calculates the remaining quantity after withdrawals
func (i *Investment) CalculateRemainingQuantity() decimal.Decimal {
	return i.DepositQty.Sub(i.WithdrawalQty)
}

// UpdatePnL recalculates the P&L based on current values
func (i *Investment) UpdatePnL() {
	if i.DepositCost.IsZero() {
		i.PnL = decimal.Zero
		i.PnLPercent = decimal.Zero
		return
	}

	totalValue := i.WithdrawalValue
	if i.IsOpen && !i.RemainingQty.IsZero() {
		// Add current market value of remaining position
		currentValue := i.RemainingQty.Mul(i.DepositUnitCost)
		totalValue = totalValue.Add(currentValue)
	}

	i.PnL = totalValue.Sub(i.DepositCost)
	i.PnLPercent = i.PnL.Div(i.DepositCost).Mul(decimal.NewFromInt(100))
}

// AddDeposit adds a new deposit to the investment and recalculates weighted average cost
func (i *Investment) AddDeposit(qty, cost decimal.Decimal) {
	if qty.IsZero() || cost.IsZero() {
		return
	}

	// Calculate new weighted average unit cost
	totalCost := i.DepositCost.Add(cost)
	totalQty := i.DepositQty.Add(qty)

	i.DepositQty = totalQty
	i.DepositCost = totalCost
	i.DepositUnitCost = totalCost.Div(totalQty)

	// Update remaining quantity
	i.RemainingQty = i.CalculateRemainingQuantity()
	i.UpdatedAt = time.Now()
}

// AddWithdrawal processes a withdrawal using the configured cost basis method
func (i *Investment) AddWithdrawal(qty, value decimal.Decimal) error {
	if qty.IsZero() || qty.IsNegative() {
		return errors.New("withdrawal quantity must be positive")
	}

	if qty.GreaterThan(i.RemainingQty) {
		return errors.New("withdrawal quantity exceeds remaining quantity")
	}

	i.WithdrawalQty = i.WithdrawalQty.Add(qty)
	i.WithdrawalValue = i.WithdrawalValue.Add(value)
	if i.WithdrawalQty.IsPositive() {
		i.WithdrawalUnitPrice = i.WithdrawalValue.Div(i.WithdrawalQty)
	}

	// Update remaining quantity
	i.RemainingQty = i.CalculateRemainingQuantity()

	// Check if investment is fully closed
	if i.RemainingQty.IsZero() {
		i.IsOpen = false
	}

	i.UpdatePnL()
	i.UpdatedAt = time.Now()
	return nil
}