package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// VaultShare represents a user's ownership shares in a vault
type VaultShare struct {
	ID      string `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	VaultID string `json:"vault_id" gorm:"column:vault_id;type:varchar(255);not null;index"`
	UserID  string `json:"user_id" gorm:"column:user_id;type:varchar(255);not null;index"`

	// Share information
	ShareBalance    decimal.Decimal `json:"share_balance" gorm:"column:share_balance;type:decimal(30,18);not null;default:0"`
	CostBasis       decimal.Decimal `json:"cost_basis" gorm:"column:cost_basis;type:decimal(30,18);not null;default:0"`
	AvgCostPerShare decimal.Decimal `json:"avg_cost_per_share" gorm:"column:avg_cost_per_share;type:decimal(30,18);not null;default:0"`

	// Transaction tracking
	TotalDeposits    decimal.Decimal `json:"total_deposits" gorm:"column:total_deposits;type:decimal(30,18);not null;default:0"`
	TotalWithdrawals decimal.Decimal `json:"total_withdrawals" gorm:"column:total_withdrawals;type:decimal(30,18);not null;default:0"`
	NetDeposits      decimal.Decimal `json:"net_deposits" gorm:"column:net_deposits;type:decimal(30,18);not null;default:0"`

	// Performance metrics
	CurrentMarketValue   decimal.Decimal `json:"current_market_value" gorm:"column:current_market_value;type:decimal(30,18);not null;default:0"`
	UnrealizedPnL        decimal.Decimal `json:"unrealized_pnl" gorm:"column:unrealized_pnl;type:decimal(30,18);not null;default:0"`
	UnrealizedPnLPercent decimal.Decimal `json:"unrealized_pnl_percent" gorm:"column:unrealized_pnl_percent;type:decimal(30,18);not null;default:0"`

	// Realized P&L from share transactions
	RealizedPnL        decimal.Decimal `json:"realized_pnl" gorm:"column:realized_pnl;type:decimal(30,18);not null;default:0"`
	RealizedPnLPercent decimal.Decimal `json:"realized_pnl_percent" gorm:"column:realized_pnl_percent;type:decimal(30,18);not null;default:0"`

	// Fee tracking
	FeesPaid decimal.Decimal `json:"fees_paid" gorm:"column:fees_paid;type:decimal(30,18);not null;default:0"`

	// Metadata
	FirstDepositDate time.Time `json:"first_deposit_date" gorm:"column:first_deposit_date;type:timestamptz;index"`
	LastActivityDate time.Time `json:"last_activity_date" gorm:"column:last_activity_date;type:timestamptz;index"`
	CreatedAt        time.Time `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt        time.Time `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the VaultShare model
func (VaultShare) TableName() string {
	return "vault_shares"
}

// Validate validates the vault share data
func (vs *VaultShare) Validate() error {
	if vs.VaultID == "" {
		return errors.New("vault ID is required")
	}
	if vs.UserID == "" {
		return errors.New("user ID is required")
	}
	if vs.ShareBalance.IsNegative() {
		return errors.New("share balance cannot be negative")
	}
	if vs.CostBasis.IsNegative() {
		return errors.New("cost basis cannot be negative")
	}
	if vs.AvgCostPerShare.IsNegative() {
		return errors.New("average cost per share cannot be negative")
	}
	return nil
}

// MintShares adds shares to the user's balance and updates cost basis
func (vs *VaultShare) MintShares(shares decimal.Decimal, costPerShare decimal.Decimal) error {
	if shares.IsZero() || shares.IsNegative() {
		return errors.New("shares to mint must be positive")
	}
	if costPerShare.IsNegative() {
		return errors.New("cost per share cannot be negative")
	}

	// Calculate additional cost basis
	additionalCost := shares.Mul(costPerShare)

	// Update cost basis and average cost
	if vs.ShareBalance.IsZero() {
		// First mint - set average cost directly
		vs.AvgCostPerShare = costPerShare
	} else {
		// Weighted average cost calculation
		totalShares := vs.ShareBalance.Add(shares)
		totalCost := vs.CostBasis.Add(additionalCost)
		vs.AvgCostPerShare = totalCost.Div(totalShares)
	}

	// Update balances
	vs.ShareBalance = vs.ShareBalance.Add(shares)
	vs.CostBasis = vs.CostBasis.Add(additionalCost)
	vs.TotalDeposits = vs.TotalDeposits.Add(additionalCost)
	vs.NetDeposits = vs.NetDeposits.Add(additionalCost)
	vs.UpdatedAt = time.Now()
	vs.LastActivityDate = time.Now()

	if vs.FirstDepositDate.IsZero() {
		vs.FirstDepositDate = time.Now()
	}

	return nil
}

// BurnShares removes shares from user's balance and realizes P&L
func (vs *VaultShare) BurnShares(shares decimal.Decimal, marketValuePerShare decimal.Decimal) error {
	if shares.IsZero() || shares.IsNegative() {
		return errors.New("shares to burn must be positive")
	}
	if shares.GreaterThan(vs.ShareBalance) {
		return errors.New("cannot burn more shares than owned")
	}
	if marketValuePerShare.IsNegative() {
		return errors.New("market value per share cannot be negative")
	}

	// Calculate proceeds and cost basis for burned shares
	proceeds := shares.Mul(marketValuePerShare)
	costBasisForShares := shares.Mul(vs.AvgCostPerShare)

	// Realized P&L for this transaction
	realizedPnL := proceeds.Sub(costBasisForShares)

	// Update balances
	vs.ShareBalance = vs.ShareBalance.Sub(shares)
	vs.CostBasis = vs.CostBasis.Sub(costBasisForShares)
	vs.TotalWithdrawals = vs.TotalWithdrawals.Add(proceeds)
	vs.NetDeposits = vs.NetDeposits.Sub(costBasisForShares)

	// Update realized P&L
	vs.RealizedPnL = vs.RealizedPnL.Add(realizedPnL)

	// Update timestamps
	vs.UpdatedAt = time.Now()
	vs.LastActivityDate = time.Now()

	return nil
}

// UpdateMarketValue updates the current market value and unrealized P&L
func (vs *VaultShare) UpdateMarketValue(currentSharePrice decimal.Decimal) {
	vs.CurrentMarketValue = vs.ShareBalance.Mul(currentSharePrice)

	// Calculate unrealized P&L
	unrealizedPnL := vs.CurrentMarketValue.Sub(vs.CostBasis)
	vs.UnrealizedPnL = unrealizedPnL

	// Calculate unrealized P&L percentage
	if !vs.CostBasis.IsZero() {
		vs.UnrealizedPnLPercent = unrealizedPnL.Div(vs.CostBasis).Mul(decimal.NewFromInt(100))
	} else {
		vs.UnrealizedPnLPercent = decimal.Zero
	}

	vs.UpdatedAt = time.Now()
}

// UpdateValueForVault updates the market value based on vault's effective price (manual or market)
func (vs *VaultShare) UpdateValueForVault(vault *Vault) {
	effectivePrice := vault.GetEffectivePrice()
	vs.UpdateMarketValue(effectivePrice)
}

// GetTotalReturn calculates total return (realized + unrealized) as a percentage
func (vs *VaultShare) GetTotalReturn() decimal.Decimal {
	totalValue := vs.CurrentMarketValue.Add(vs.TotalWithdrawals)
	totalCost := vs.CostBasis.Add(vs.TotalWithdrawals).Sub(vs.NetDeposits)

	if totalCost.IsZero() {
		return decimal.Zero
	}

	return totalValue.Sub(totalCost).Div(totalCost).Mul(decimal.NewFromInt(100))
}

// VaultShareFilter represents filters for querying vault shares
type VaultShareFilter struct {
	VaultID          *string
	UserID           *string
	MinShareBalance  *decimal.Decimal
	MaxShareBalance  *decimal.Decimal
	MinMarketValue   *decimal.Decimal
	MaxMarketValue   *decimal.Decimal
	HasUnrealizedPnL *bool
	HasRealizedPnL   *bool
	StartDate        *time.Time
	EndDate          *time.Time
	Limit            int
	Offset           int
}

// VaultShareHistory tracks the history of share transactions
type VaultShareHistory struct {
	ID           string `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	VaultShareID string `json:"vault_share_id" gorm:"column:vault_share_id;type:varchar(255);not null;index"`
	VaultID      string `json:"vault_id" gorm:"column:vault_id;type:varchar(255);not null;index"`
	UserID       string `json:"user_id" gorm:"column:user_id;type:varchar(255);not null;index"`

	// Transaction details
	Type          string          `json:"type" gorm:"column:type;type:varchar(20);not null"` // "mint" or "burn"
	Shares        decimal.Decimal `json:"shares" gorm:"column:shares;type:decimal(30,18);not null"`
	PricePerShare decimal.Decimal `json:"price_per_share" gorm:"column:price_per_share;type:decimal(30,18);not null"`
	TotalAmount   decimal.Decimal `json:"total_amount" gorm:"column:total_amount;type:decimal(30,18);not null"`

	// Fee information
	FeeAmount decimal.Decimal `json:"fee_amount" gorm:"column:fee_amount;type:decimal(30,18);not null;default:0"`
	FeeType   string          `json:"fee_type" gorm:"column:fee_type;type:varchar(20)"`

	// Balance snapshot
	BalanceBefore decimal.Decimal `json:"balance_before" gorm:"column:balance_before;type:decimal(30,18);not null"`
	BalanceAfter  decimal.Decimal `json:"balance_after" gorm:"column:balance_after;type:decimal(30,18);not null"`

	// Metadata
	Timestamp       time.Time `json:"timestamp" gorm:"column:timestamp;type:timestamptz;not null;index"`
	TransactionHash *string   `json:"transaction_hash,omitempty" gorm:"column:transaction_hash;type:varchar(255)"`
	Notes           *string   `json:"notes,omitempty" gorm:"column:notes;type:text"`
}

// TableName returns the table name for the VaultShareHistory model
func (VaultShareHistory) TableName() string {
	return "vault_share_history"
}
