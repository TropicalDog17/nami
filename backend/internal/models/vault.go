package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// VaultStatus represents the status of a vault
type VaultStatus string

const (
	VaultStatusActive    VaultStatus = "active"
	VaultStatusPaused    VaultStatus = "paused"
	VaultStatusClosed    VaultStatus = "closed"
	VaultStatusLiquidating VaultStatus = "liquidating"
)

// VaultType represents different types of vaults
type VaultType string

const (
	VaultTypeSingleAsset   VaultType = "single_asset"
	VaultTypeMultiAsset    VaultType = "multi_asset"
	VaultTypeYieldFarming  VaultType = "yield_farming"
	VaultTypeLiquidity     VaultType = "liquidity"
	VaultTypeStaking       VaultType = "staking"
	VaultTypeUserDefined   VaultType = "user_defined"  // User-defined token with manual value tracking
)

// FeeType represents different fee types
type FeeType string

const (
	FeeTypeManagement     FeeType = "management"
	FeeTypePerformance    FeeType = "performance"
	FeeTypeDeposit        FeeType = "deposit"
	FeeTypeWithdrawal     FeeType = "withdrawal"
)

// Vault represents a tokenized investment vault
type Vault struct {
	ID          string      `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	Name        string      `json:"name" gorm:"column:name;type:varchar(255);not null"`
	Description *string     `json:"description,omitempty" gorm:"column:description;type:text"`
	Type        VaultType   `json:"type" gorm:"column:type;type:varchar(50);not null;default:'single_asset'"`
	Status      VaultStatus `json:"status" gorm:"column:status;type:varchar(20);not null;default:'active'"`

	// Token information
	TokenSymbol   string `json:"token_symbol" gorm:"column:token_symbol;type:varchar(20);not null"`
	TokenDecimals int    `json:"token_decimals" gorm:"column:token_decimals;type:integer;not null;default:18"`
	TotalSupply   decimal.Decimal `json:"total_supply" gorm:"column:total_supply;type:decimal(30,18);not null;default:0"`

	// Financial metrics
	TotalAssetsUnderManagement decimal.Decimal `json:"total_assets_under_management" gorm:"column:total_assets_under_management;type:decimal(30,18);not null;default:0"`
	CurrentSharePrice          decimal.Decimal `json:"current_share_price" gorm:"column:current_share_price;type:decimal(30,18);not null;default:1"`
	InitialSharePrice          decimal.Decimal `json:"initial_share_price" gorm:"column:initial_share_price;type:decimal(30,18);not null;default:1"`

	// User-defined token specific fields
	IsUserDefinedPrice      bool           `json:"is_user_defined_price" gorm:"column:is_user_defined_price;type:boolean;not null;default:false"`
	ManualPricePerShare     decimal.Decimal `json:"manual_price_per_share" gorm:"column:manual_price_per_share;type:decimal(30,18);not null;default:0"`
	PriceLastUpdatedBy      *string        `json:"price_last_updated_by,omitempty" gorm:"column:price_last_updated_by;type:varchar(255)"`
	PriceLastUpdatedAt      *time.Time     `json:"price_last_updated_at,omitempty" gorm:"column:price_last_updated_at;type:timestamptz"`
	PriceUpdateNotes        *string        `json:"price_update_notes,omitempty" gorm:"column:price_update_notes;type:text"`

	// Configuration
	MinDepositAmount        decimal.Decimal `json:"min_deposit_amount" gorm:"column:min_deposit_amount;type:decimal(30,18);not null;default:0"`
	MaxDepositAmount        *decimal.Decimal `json:"max_deposit_amount,omitempty" gorm:"column:max_deposit_amount;type:decimal(30,18)"`
	MinWithdrawalAmount     decimal.Decimal `json:"min_withdrawal_amount" gorm:"column:min_withdrawal_amount;type:decimal(30,18);not null;default:0"`
	IsDepositAllowed        bool `json:"is_deposit_allowed" gorm:"column:is_deposit_allowed;type:boolean;not null;default:true"`
	IsWithdrawalAllowed     bool `json:"is_withdrawal_allowed" gorm:"column:is_withdrawal_allowed;type:boolean;not null;default:true"`

	// Performance tracking
	InceptionDate    time.Time      `json:"inception_date" gorm:"column:inception_date;type:timestamptz;not null"`
	LastUpdated      time.Time      `json:"last_updated" gorm:"column:last_updated;type:timestamptz;not null"`

	// Metadata
	CreatedBy string    `json:"created_by" gorm:"column:created_by;type:varchar(255);not null"`
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the Vault model
func (Vault) TableName() string {
	return "vaults"
}

// Validate validates the vault data
func (v *Vault) Validate() error {
	if v.Name == "" {
		return errors.New("vault name is required")
	}
	if v.Type == "" {
		v.Type = VaultTypeSingleAsset
	}
	if v.Status == "" {
		v.Status = VaultStatusActive
	}
	if v.TokenSymbol == "" {
		return errors.New("token symbol is required")
	}
	if v.TokenDecimals <= 0 || v.TokenDecimals > 36 {
		return errors.New("token decimals must be between 1 and 36")
	}
	if v.MinDepositAmount.IsNegative() {
		return errors.New("min deposit amount cannot be negative")
	}
	if v.MaxDepositAmount != nil && v.MaxDepositAmount.IsNegative() {
		return errors.New("max deposit amount cannot be negative")
	}
	if v.MinWithdrawalAmount.IsNegative() {
		return errors.New("min withdrawal amount cannot be negative")
	}
	if v.InceptionDate.IsZero() {
		v.InceptionDate = time.Now()
	}
	if v.CreatedBy == "" {
		return errors.New("created by is required")
	}
	return nil
}

// CalculateSharesForAmount calculates how many shares an amount gets at current price
func (v *Vault) CalculateSharesForAmount(amount decimal.Decimal) decimal.Decimal {
	if v.CurrentSharePrice.IsZero() {
		return decimal.Zero
	}
	return amount.Div(v.CurrentSharePrice)
}

// CalculateAmountForShares calculates the USD value of a number of shares
func (v *Vault) CalculateAmountForShares(shares decimal.Decimal) decimal.Decimal {
	return shares.Mul(v.CurrentSharePrice)
}

// UpdateSharePrice updates the share price based on total AUM and total supply
func (v *Vault) UpdateSharePrice(totalAUM decimal.Decimal) {
	v.TotalAssetsUnderManagement = totalAUM
	if v.TotalSupply.IsZero() {
		v.CurrentSharePrice = v.InitialSharePrice
	} else {
		v.CurrentSharePrice = totalAUM.Div(v.TotalSupply)
	}
	v.LastUpdated = time.Now()
}

// CalculatePerformanceSinceInception calculates performance since vault inception
func (v *Vault) CalculatePerformanceSinceInception() decimal.Decimal {
	if v.InitialSharePrice.IsZero() {
		return decimal.Zero
	}
	return v.CurrentSharePrice.Sub(v.InitialSharePrice).Div(v.InitialSharePrice).Mul(decimal.NewFromInt(100))
}

// UpdateManualPrice allows manual price updates for user-defined tokens
func (v *Vault) UpdateManualPrice(newPrice decimal.Decimal, updatedBy string, notes *string) error {
	if newPrice.IsNegative() {
		return errors.New("price cannot be negative")
	}
	if updatedBy == "" {
		return errors.New("updated by is required")
	}

	// Update price information
	v.IsUserDefinedPrice = true
	v.ManualPricePerShare = newPrice
	v.CurrentSharePrice = newPrice
	v.PriceLastUpdatedBy = &updatedBy
	now := time.Now()
	v.PriceLastUpdatedAt = &now
	v.PriceUpdateNotes = notes

	// Update AUM based on new price
	v.TotalAssetsUnderManagement = v.TotalSupply.Mul(newPrice)

	// Update timestamp
	v.LastUpdated = now

	return nil
}

// EnableManualPricing enables manual price control for user-defined tokens
func (v *Vault) EnableManualPricing(initialPrice decimal.Decimal, updatedBy string) error {
	if initialPrice.IsNegative() || initialPrice.IsZero() {
		return errors.New("initial price must be positive")
	}
	if updatedBy == "" {
		return errors.New("updated by is required")
	}

	v.IsUserDefinedPrice = true
	v.ManualPricePerShare = initialPrice
	v.CurrentSharePrice = initialPrice
	v.PriceLastUpdatedBy = &updatedBy
	now := time.Now()
	v.PriceLastUpdatedAt = &now
	v.LastUpdated = now

	// Update AUM
	v.TotalAssetsUnderManagement = v.TotalSupply.Mul(initialPrice)

	return nil
}

// DisableManualPricing disables manual price control and switches to market-based pricing
func (v *Vault) DisableManualPricing() {
	v.IsUserDefinedPrice = false
	v.ManualPricePerShare = decimal.Zero
	v.PriceLastUpdatedBy = nil
	v.PriceLastUpdatedAt = nil
	v.PriceUpdateNotes = nil
	v.LastUpdated = time.Now()
}

// GetEffectivePrice returns the current effective price (manual if enabled, otherwise market price)
func (v *Vault) GetEffectivePrice() decimal.Decimal {
	if v.IsUserDefinedPrice && v.ManualPricePerShare.IsPositive() {
		return v.ManualPricePerShare
	}
	return v.CurrentSharePrice
}

// IsManuallyPriced returns whether the vault is using manual pricing
func (v *Vault) IsManuallyPriced() bool {
	return v.IsUserDefinedPrice
}

// VaultFilter represents filters for querying vaults
type VaultFilter struct {
	Type            *VaultType
	Status          *VaultStatus
	CreatedBy       *string
	MinAUM          *decimal.Decimal
	MaxAUM          *decimal.Decimal
	TokenSymbol     *string
	IsDepositAllowed *bool
	IsWithdrawalAllowed *bool
	StartDate       *time.Time
	EndDate         *time.Time
	Limit           int
	Offset          int
}

// VaultSummary provides aggregated vault statistics
type VaultSummary struct {
	TotalVaults            int             `json:"total_vaults"`
	ActiveVaults           int             `json:"active_vaults"`
	TotalAUM               decimal.Decimal `json:"total_aum"`
	TotalSharesOutstanding decimal.Decimal `json:"total_shares_outstanding"`
	AverageSharePrice      decimal.Decimal `json:"average_share_price"`
	BestPerformingVault    string          `json:"best_performing_vault"`
	WorstPerformingVault   string          `json:"worst_performing_vault"`
}