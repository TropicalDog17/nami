package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// VaultTransactionType represents different types of vault transactions
type VaultTransactionType string

const (
	VaultTxTypeDeposit     VaultTransactionType = "deposit"
	VaultTxTypeWithdrawal  VaultTransactionType = "withdrawal"
	VaultTxTypeMintShares  VaultTransactionType = "mint_shares"
	VaultTxTypeBurnShares  VaultTransactionType = "burn_shares"
	VaultTxTypeRebalance   VaultTransactionType = "rebalance"
	VaultTxTypeFee         VaultTransactionType = "fee"
	VaultTxTypeYield       VaultTransactionType = "yield"
	VaultTxTypeIncome      VaultTransactionType = "income"
	VaultTxTypeExpense     VaultTransactionType = "expense"
	VaultTxTypeValuation   VaultTransactionType = "valuation"
)

// VaultTransaction represents transactions within the tokenized vault system
type VaultTransaction struct {
	ID               string               `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	VaultID          string               `json:"vault_id" gorm:"column:vault_id;type:varchar(255);not null;index"`
	UserID           *string              `json:"user_id,omitempty" gorm:"column:user_id;type:varchar(255);index"`

	// Transaction details
	Type             VaultTransactionType `json:"type" gorm:"column:type;type:varchar(20);not null;index"`
	Status           string               `json:"status" gorm:"column:status;type:varchar(20);not null;default:'pending'"`

	// Financial amounts
	AmountUSD        decimal.Decimal `json:"amount_usd" gorm:"column:amount_usd;type:decimal(30,18);not null"`
	Shares           decimal.Decimal `json:"shares" gorm:"column:shares;type:decimal(30,18);not null;default:0"`
	PricePerShare    decimal.Decimal `json:"price_per_share" gorm:"column:price_per_share;type:decimal(30,18);not null;default:0"`

	// Asset information (for rebalancing and asset-specific transactions)
	Asset            *string           `json:"asset,omitempty" gorm:"column:asset;type:varchar(50);index"`
	Account          *string           `json:"account,omitempty" gorm:"column:account;type:varchar(100);index"`
	AssetQuantity    decimal.Decimal   `json:"asset_quantity" gorm:"column:asset_quantity;type:decimal(30,18);not null;default:0"`
	AssetPrice       decimal.Decimal   `json:"asset_price" gorm:"column:asset_price;type:decimal(30,18);not null;default:0"`

	// Fee information
	FeeAmount        decimal.Decimal `json:"fee_amount" gorm:"column:fee_amount;type:decimal(30,18);not null;default:0"`
	FeeType          *string         `json:"fee_type,omitempty" gorm:"column:fee_type;type:varchar(20)"`
	FeeRate          decimal.Decimal `json:"fee_rate" gorm:"column:fee_rate;type:decimal(8,8);not null;default:0"`

	// Price and valuation information
	VaultAUMBefore   decimal.Decimal `json:"vault_aum_before" gorm:"column:vault_aum_before;type:decimal(30,18);not null;default:0"`
	VaultAUMAfter    decimal.Decimal `json:"vault_aum_after" gorm:"column:vault_aum_after;type:decimal(30,18);not null;default:0"`
	SharePriceBefore decimal.Decimal `json:"share_price_before" gorm:"column:share_price_before;type:decimal(30,18);not null;default:0"`
	SharePriceAfter  decimal.Decimal `json:"share_price_after" gorm:"column:share_price_after;type:decimal(30,18);not null;default:0"`

	// User balance snapshots
	UserSharesBefore decimal.Decimal `json:"user_shares_before" gorm:"column:user_shares_before;type:decimal(30,18);not null;default:0"`
	UserSharesAfter  decimal.Decimal `json:"user_shares_after" gorm:"column:user_shares_after;type:decimal(30,18);not null;default:0"`

	// Metadata
	Timestamp        time.Time       `json:"timestamp" gorm:"column:timestamp;type:timestamptz;not null;index"`
	ExecutedAt       *time.Time      `json:"executed_at,omitempty" gorm:"column:executed_at;type:timestamptz;index"`
	TransactionHash  *string         `json:"transaction_hash,omitempty" gorm:"column:transaction_hash;type:varchar(255)"`
	ExternalTxID     *string         `json:"external_tx_id,omitempty" gorm:"column:external_tx_id;type:varchar(255)"`
	Notes            *string         `json:"notes,omitempty" gorm:"column:notes;type:text"`

	// Audit fields
	CreatedBy        string          `json:"created_by" gorm:"column:created_by;type:varchar(255);not null"`
	CreatedAt        time.Time       `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt        time.Time       `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the VaultTransaction model
func (VaultTransaction) TableName() string {
	return "vault_transactions"
}

// Validate validates the vault transaction data
func (vt *VaultTransaction) Validate() error {
	if vt.VaultID == "" {
		return errors.New("vault ID is required")
	}
	if vt.Type == "" {
		return errors.New("transaction type is required")
	}
	if vt.AmountUSD.IsNegative() {
		return errors.New("amount USD cannot be negative")
	}
	if vt.Shares.IsNegative() {
		return errors.New("shares cannot be negative")
	}
	if vt.PricePerShare.IsNegative() {
		return errors.New("price per share cannot be negative")
	}
	if vt.FeeAmount.IsNegative() {
		return errors.New("fee amount cannot be negative")
	}
	if vt.FeeRate.IsNegative() {
		return errors.New("fee rate cannot be negative")
	}
	if vt.CreatedBy == "" {
		return errors.New("created by is required")
	}
	if vt.Timestamp.IsZero() {
		vt.Timestamp = time.Now()
	}

	// Validate transaction type specific requirements
	switch vt.Type {
	case VaultTxTypeDeposit, VaultTxTypeWithdrawal:
		if vt.UserID == nil {
			return errors.New("user ID is required for deposit/withdrawal transactions")
		}
		if vt.AmountUSD.IsZero() {
			return errors.New("amount USD is required for deposit/withdrawal transactions")
		}
	case VaultTxTypeMintShares, VaultTxTypeBurnShares:
		if vt.UserID == nil {
			return errors.New("user ID is required for share mint/burn transactions")
		}
		if vt.Shares.IsZero() {
			return errors.New("shares are required for share mint/burn transactions")
		}
		if vt.PricePerShare.IsZero() {
			return errors.New("price per share is required for share mint/burn transactions")
		}
	case VaultTxTypeRebalance:
		if vt.Asset == nil || *vt.Asset == "" {
			return errors.New("asset is required for rebalancing transactions")
		}
		if vt.AssetQuantity.IsZero() {
			return errors.New("asset quantity is required for rebalancing transactions")
		}
	case VaultTxTypeFee:
		if vt.FeeType == nil || *vt.FeeType == "" {
			return errors.New("fee type is required for fee transactions")
		}
	}

	return nil
}

// Execute marks the transaction as executed and sets execution data
func (vt *VaultTransaction) Execute() error {
	if vt.Status == "executed" {
		return errors.New("transaction is already executed")
	}

	now := time.Now()
	vt.Status = "executed"
	vt.ExecutedAt = &now
	vt.UpdatedAt = now

	return nil
}

// CalculateFeeAmount calculates fee amount based on rate and transaction amount
func (vt *VaultTransaction) CalculateFeeAmount() decimal.Decimal {
	if vt.FeeRate.IsZero() {
		return decimal.Zero
	}

	var baseAmount decimal.Decimal
	switch vt.Type {
	case VaultTxTypeDeposit, VaultTxTypeMintShares:
		baseAmount = vt.AmountUSD
	case VaultTxTypeWithdrawal, VaultTxTypeBurnShares:
		baseAmount = vt.AmountUSD
	case VaultTxTypeRebalance:
		baseAmount = vt.AssetQuantity.Mul(vt.AssetPrice)
	default:
		return decimal.Zero
	}

	return baseAmount.Mul(vt.FeeRate)
}

// GetNetAmount returns the net amount after deducting fees
func (vt *VaultTransaction) GetNetAmount() decimal.Decimal {
	return vt.AmountUSD.Sub(vt.FeeAmount)
}

// VaultTransactionFilter represents filters for querying vault transactions
type VaultTransactionFilter struct {
	VaultID            *string
	UserID             *string
	Type               *VaultTransactionType
	Status             *string
	Asset              *string
	MinAmount          *decimal.Decimal
	MaxAmount          *decimal.Decimal
	MinShares          *decimal.Decimal
	MaxShares          *decimal.Decimal
	StartDate          *time.Time
	EndDate            *time.Time
	TransactionHash    *string
	ExternalTxID       *string
	Limit              int
	Offset             int
}

// VaultTransactionSummary provides aggregated transaction statistics
type VaultTransactionSummary struct {
	TotalTransactions     int             `json:"total_transactions"`
	TotalDeposits         decimal.Decimal `json:"total_deposits"`
	TotalWithdrawals      decimal.Decimal `json:"total_withdrawals"`
	TotalSharesMinted     decimal.Decimal `json:"total_shares_minted"`
	TotalSharesBurned     decimal.Decimal `json:"total_shares_burned"`
	TotalFeesCollected    decimal.Decimal `json:"total_fees_collected"`
	NetDepositFlow       decimal.Decimal `json:"net_deposit_flow"`
	AverageDepositSize   decimal.Decimal `json:"average_deposit_size"`
	AverageWithdrawalSize decimal.Decimal `json:"average_withdrawal_size"`
}

// VaultPerformance tracks vault performance metrics over time
type VaultPerformance struct {
	ID               string          `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	VaultID          string          `json:"vault_id" gorm:"column:vault_id;type:varchar(255);not null;index"`

	// Time period
	Period           string          `json:"period" gorm:"column:period;type:varchar(20);not null;index"` // "daily", "weekly", "monthly", "yearly"
	PeriodStart      time.Time       `json:"period_start" gorm:"column:period_start;type:timestamptz;not null;index"`
	PeriodEnd        time.Time       `json:"period_end" gorm:"column:period_end;type:timestamptz;not null;index"`

	// Performance metrics
	StartingAUM      decimal.Decimal `json:"starting_aum" gorm:"column:starting_aum;type:decimal(30,18);not null;default:0"`
	EndingAUM        decimal.Decimal `json:"ending_aum" gorm:"column:ending_aum;type:decimal(30,18);not null;default:0"`
	StartingSharePrice decimal.Decimal `json:"starting_share_price" gorm:"column:starting_share_price;type:decimal(30,18);not null;default:0"`
	EndingSharePrice decimal.Decimal `json:"ending_share_price" gorm:"column:ending_share_price;type:decimal(30,18);not null;default:0"`

	// Returns
	TotalReturn      decimal.Decimal `json:"total_return" gorm:"column:total_return;type:decimal(30,18);not null;default:0"`
	TotalReturnPct   decimal.Decimal `json:"total_return_pct" gorm:"column:total_return_pct;type:decimal(10,8);not null;default:0"`
	AnnualizedReturn decimal.Decimal `json:"annualized_return" gorm:"column:annualized_return;type:decimal(10,8);not null;default:0"`

	// Volatility and risk metrics
	Volatility       decimal.Decimal `json:"volatility" gorm:"column:volatility;type:decimal(10,8);not null;default:0"`
	MaxDrawdown      decimal.Decimal `json:"max_drawdown" gorm:"column:max_drawdown;type:decimal(10,8);not null;default:0"`
	SharpeRatio      decimal.Decimal `json:"sharpe_ratio" gorm:"column:sharpe_ratio;type:decimal(10,8);not null;default:0"`

	// Activity metrics
	NetDeposits      decimal.Decimal `json:"net_deposits" gorm:"column:net_deposits;type:decimal(30,18);not null;default:0"`
	TotalFees        decimal.Decimal `json:"total_fees" gorm:"column:total_fees;type:decimal(30,18);not null;default:0"`

	// Metadata
	CreatedAt        time.Time       `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt        time.Time       `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the VaultPerformance model
func (VaultPerformance) TableName() string {
	return "vault_performance"
}