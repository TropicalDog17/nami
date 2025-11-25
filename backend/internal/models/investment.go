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
// NOTE: This model is maintained for backward compatibility during migration to tokenized vaults
// New implementations should use the Vault, VaultShare, and VaultAsset models
type Investment struct {
	ID      string  `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	Asset   string  `json:"asset" gorm:"column:asset;type:varchar(50);not null;index"`
	Account string  `json:"account" gorm:"column:account;type:varchar(100);not null;index"`
	Horizon *string `json:"horizon,omitempty" gorm:"column:horizon;type:varchar(20);index"`

	// Vault migration fields
	VaultID    *string `json:"vault_id,omitempty" gorm:"column:vault_id;type:varchar(255);index"`
	IsMigrated bool    `json:"is_migrated" gorm:"column:is_migrated;type:boolean;not null;default:false"`

	// Aggregated deposit information
	DepositDate     time.Time       `json:"deposit_date" gorm:"column:deposit_date;type:timestamptz;not null;index"`        // First deposit date
	DepositQty      decimal.Decimal `json:"deposit_qty" gorm:"column:deposit_qty;type:decimal(30,18);not null"`             // Total quantity deposited
	DepositCost     decimal.Decimal `json:"deposit_cost" gorm:"column:deposit_cost;type:decimal(30,18);not null"`           // Total cost in USD
	DepositUnitCost decimal.Decimal `json:"deposit_unit_cost" gorm:"column:deposit_unit_cost;type:decimal(30,18);not null"` // Weighted average unit cost

	// Withdrawal information (if closed)
	WithdrawalDate      *time.Time      `json:"withdrawal_date,omitempty" gorm:"column:withdrawal_date;type:timestamptz;index"`
	WithdrawalQty       decimal.Decimal `json:"withdrawal_qty" gorm:"column:withdrawal_qty;type:decimal(30,18);not null;default:0"`
	WithdrawalValue     decimal.Decimal `json:"withdrawal_value" gorm:"column:withdrawal_value;type:decimal(30,18);not null;default:0"`
	WithdrawalUnitPrice decimal.Decimal `json:"withdrawal_unit_price" gorm:"column:withdrawal_unit_price;type:decimal(30,18);not null;default:0"`

	// P&L calculation
	PnL        decimal.Decimal `json:"pnl" gorm:"column:pnl;type:decimal(30,18);not null;default:0"`
	PnLPercent decimal.Decimal `json:"pnl_percent" gorm:"column:pnl_percent;type:decimal(30,18);not null;default:0"`

	// Derived fields (not persisted)
	RealizedPnL  decimal.Decimal `json:"realized_pnl" gorm:"-"`
	RemainingQty decimal.Decimal `json:"remaining_qty" gorm:"-"`

	// Status and quantities
	IsOpen bool `json:"is_open" gorm:"column:is_open;type:boolean;not null;default:true"`

	// Configuration
	CostBasisMethod CostBasisMethod `json:"cost_basis_method" gorm:"column:cost_basis_method;type:varchar(20);not null;default:'fifo'"`

	// Metadata
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the Investment model
func (Investment) TableName() string {
	return "investments"
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
	TotalInvestments  int `json:"total_investments"`
	OpenInvestments   int `json:"open_investments"`
	ClosedInvestments int `json:"closed_investments"`

	TotalDeposits    decimal.Decimal `json:"total_deposits"`
	TotalWithdrawals decimal.Decimal `json:"total_withdrawals"`
	RealizedPnL      decimal.Decimal `json:"realized_pnl"`

	OpenMarketValue decimal.Decimal `json:"open_market_value"`
	UnrealizedPnL   decimal.Decimal `json:"unrealized_pnl"`
	TotalPnL        decimal.Decimal `json:"total_pnl"`

	ROI decimal.Decimal `json:"roi_percent"`
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
	if i.DepositQty.IsNegative() {
		return errors.New("deposit quantity cannot be negative")
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

// UpdatePnL recalculates the P&L based on current values
func (i *Investment) UpdatePnL() {
	if i.DepositCost.IsZero() {
		i.PnL = decimal.Zero
		i.PnLPercent = decimal.Zero
		return
	}

	// Calculate cost basis for withdrawals
	var costBasisForWithdrawal decimal.Decimal
	if i.DepositQty.IsPositive() {
		if i.WithdrawalQty.GreaterThanOrEqual(i.DepositQty) {
			// Overwithdrawal or full withdrawal - use total deposit cost
			costBasisForWithdrawal = i.DepositCost
		} else {
			// Partial withdrawal - use proportional cost basis
			costBasisForWithdrawal = i.DepositCost.Mul(i.WithdrawalQty).Div(i.DepositQty)
		}
	} else {
		costBasisForWithdrawal = decimal.Zero
	}

	// Calculate realized P&L from withdrawals using cost basis
	realizedPnL := i.WithdrawalValue.Sub(costBasisForWithdrawal)

	// Realize PnL only when explicitly closed
	if !i.IsOpen {
		i.PnL = realizedPnL
		if !costBasisForWithdrawal.IsZero() {
			i.PnLPercent = i.PnL.Div(costBasisForWithdrawal).Mul(decimal.NewFromInt(100))
		}
		return
	}

	// While open (regardless of withdrawal amount), do not realize PnL
	i.PnL = decimal.Zero
	i.PnLPercent = decimal.Zero
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

	i.UpdatedAt = time.Now()
}

// AddWithdrawal processes a withdrawal using the configured cost basis method
func (i *Investment) AddWithdrawal(qty, value decimal.Decimal) error {
	if qty.IsZero() || qty.IsNegative() {
		return errors.New("withdrawal quantity must be positive")
	}

	i.WithdrawalQty = i.WithdrawalQty.Add(qty)
	i.WithdrawalValue = i.WithdrawalValue.Add(value)
	if i.WithdrawalQty.IsPositive() {
		i.WithdrawalUnitPrice = i.WithdrawalValue.Div(i.WithdrawalQty)
	}

	i.UpdatePnL()
	i.UpdatedAt = time.Now()
	return nil
}

// Copy creates a deep copy of the Investment
func (i *Investment) Copy() *Investment {
	copied := &Investment{
		ID:                  i.ID,
		Asset:               i.Asset,
		Account:             i.Account,
		Horizon:             i.Horizon,
		DepositDate:         i.DepositDate,
		DepositQty:          i.DepositQty,
		DepositCost:         i.DepositCost,
		DepositUnitCost:     i.DepositUnitCost,
		WithdrawalDate:      i.WithdrawalDate,
		WithdrawalQty:       i.WithdrawalQty,
		WithdrawalValue:     i.WithdrawalValue,
		WithdrawalUnitPrice: i.WithdrawalUnitPrice,
		PnL:                 i.PnL,
		PnLPercent:          i.PnLPercent,
		RealizedPnL:         i.RealizedPnL,
		RemainingQty:        i.RemainingQty,
		IsOpen:              i.IsOpen,
		CostBasisMethod:     i.CostBasisMethod,
		CreatedAt:           i.CreatedAt,
		UpdatedAt:           i.UpdatedAt,
	}
	return copied
}
