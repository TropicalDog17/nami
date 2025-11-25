package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// VaultAsset represents a specific asset held within a vault
type VaultAsset struct {
	ID               string          `json:"id" gorm:"primaryKey;column:id;type:varchar(255)"`
	VaultID          string          `json:"vault_id" gorm:"column:vault_id;type:varchar(255);not null;index"`
	Asset            string          `json:"asset" gorm:"column:asset;type:varchar(50);not null;index"`
	Account          string          `json:"account" gorm:"column:account;type:varchar(100);not null;index"`

	// Position information
	Quantity         decimal.Decimal `json:"quantity" gorm:"column:quantity;type:decimal(30,18);not null;default:0"`
	AvgCostBasis     decimal.Decimal `json:"avg_cost_basis" gorm:"column:avg_cost_basis;type:decimal(30,18);not null;default:0"`
	CurrentPrice     decimal.Decimal `json:"current_price" gorm:"column:current_price;type:decimal(30,18);not null;default:0"`
	CurrentMarketValue decimal.Decimal `json:"current_market_value" gorm:"column:current_market_value;type:decimal(30,18);not null;default:0"`

	// Allocation settings
	TargetAllocation  *decimal.Decimal `json:"target_allocation,omitempty" gorm:"column:target_allocation;type:decimal(5,4)"`  // Percentage 0.0000 to 1.0000
	MinAllocation     *decimal.Decimal `json:"min_allocation,omitempty" gorm:"column:min_allocation;type:decimal(5,4)"`        // Percentage 0.0000 to 1.0000
	MaxAllocation     *decimal.Decimal `json:"max_allocation,omitempty" gorm:"column:max_allocation;type:decimal(5,4)"`        // Percentage 0.0000 to 1.0000
	IsRebalancing     bool            `json:"is_rebalancing" gorm:"column:is_rebalancing;type:boolean;not null;default:false"`

	// Performance tracking
	UnrealizedPnL     decimal.Decimal `json:"unrealized_pnl" gorm:"column:unrealized_pnl;type:decimal(30,18);not null;default:0"`
	UnrealizedPnLPercent decimal.Decimal `json:"unrealized_pnl_percent" gorm:"column:unrealized_pnl_percent;type:decimal(30,18);not null;default:0"`
	RealizedPnL       decimal.Decimal `json:"realized_pnl" gorm:"column:realized_pnl;type:decimal(30,18);not null;default:0"`

	// Transaction tracking
	TotalBought       decimal.Decimal `json:"total_bought" gorm:"column:total_bought;type:decimal(30,18);not null;default:0"`
	TotalSold         decimal.Decimal `json:"total_sold" gorm:"column:total_sold;type:decimal(30,18);not null;default:0"`
	TotalCost         decimal.Decimal `json:"total_cost" gorm:"column:total_cost;type:decimal(30,18);not null;default:0"`
	TotalProceeds     decimal.Decimal `json:"total_proceeds" gorm:"column:total_proceeds;type:decimal(30,18);not null;default:0"`

	// Yield and income tracking
	IncomeReceived    decimal.Decimal `json:"income_received" gorm:"column:income_received;type:decimal(30,18);not null;default:0"`
	YieldRate         *decimal.Decimal `json:"yield_rate,omitempty" gorm:"column:yield_rate;type:decimal(8,8)"`  // Annual yield rate

	// Metadata
	FirstAcquiredDate time.Time       `json:"first_acquired_date" gorm:"column:first_acquired_date;type:timestamptz;index"`
	LastUpdated       time.Time       `json:"last_updated" gorm:"column:last_updated;type:timestamptz;not null;index"`
	CreatedAt         time.Time       `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
	UpdatedAt         time.Time       `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

// TableName returns the table name for the VaultAsset model
func (VaultAsset) TableName() string {
	return "vault_assets"
}

// Validate validates the vault asset data
func (va *VaultAsset) Validate() error {
	if va.VaultID == "" {
		return errors.New("vault ID is required")
	}
	if va.Asset == "" {
		return errors.New("asset is required")
	}
	if va.Account == "" {
		return errors.New("account is required")
	}
	if va.Quantity.IsNegative() {
		return errors.New("quantity cannot be negative")
	}
	if va.AvgCostBasis.IsNegative() {
		return errors.New("average cost basis cannot be negative")
	}
	if va.CurrentPrice.IsNegative() {
		return errors.New("current price cannot be negative")
	}

	// Validate allocation percentages
	if va.TargetAllocation != nil {
		if va.TargetAllocation.IsNegative() || va.TargetAllocation.GreaterThan(decimal.NewFromInt(1)) {
			return errors.New("target allocation must be between 0 and 1")
		}
	}
	if va.MinAllocation != nil {
		if va.MinAllocation.IsNegative() || va.MinAllocation.GreaterThan(decimal.NewFromInt(1)) {
			return errors.New("min allocation must be between 0 and 1")
		}
	}
	if va.MaxAllocation != nil {
		if va.MaxAllocation.IsNegative() || va.MaxAllocation.GreaterThan(decimal.NewFromInt(1)) {
			return errors.New("max allocation must be between 0 and 1")
		}
	}

	return nil
}

// UpdateMarketValue updates the current market value and P&L calculations
func (va *VaultAsset) UpdateMarketValue(currentPrice decimal.Decimal) {
	va.CurrentPrice = currentPrice
	va.CurrentMarketValue = va.Quantity.Mul(currentPrice)

	// Calculate unrealized P&L
	totalCost := va.Quantity.Mul(va.AvgCostBasis)
	unrealizedPnL := va.CurrentMarketValue.Sub(totalCost)
	va.UnrealizedPnL = unrealizedPnL

	// Calculate unrealized P&L percentage
	if !totalCost.IsZero() {
		va.UnrealizedPnLPercent = unrealizedPnL.Div(totalCost).Mul(decimal.NewFromInt(100))
	} else {
		va.UnrealizedPnLPercent = decimal.Zero
	}

	va.LastUpdated = time.Now()
	va.UpdatedAt = time.Now()
}

// AddPosition adds to the existing position and updates average cost basis
func (va *VaultAsset) AddPosition(quantity decimal.Decimal, price decimal.Decimal) error {
	if quantity.IsZero() || quantity.IsNegative() {
		return errors.New("quantity to add must be positive")
	}
	if price.IsNegative() {
		return errors.New("price cannot be negative")
	}

	additionalCost := quantity.Mul(price)

	// Update average cost basis using weighted average
	if va.Quantity.IsZero() {
		// First position
		va.AvgCostBasis = price
		va.Quantity = quantity
		va.TotalCost = additionalCost
	} else {
		// Weighted average calculation
		totalQuantity := va.Quantity.Add(quantity)
		totalCost := va.TotalCost.Add(additionalCost)
		va.AvgCostBasis = totalCost.Div(totalQuantity)
		va.Quantity = totalQuantity
		va.TotalCost = totalCost
	}

	va.TotalBought = va.TotalBought.Add(quantity)
	va.CurrentMarketValue = va.Quantity.Mul(va.CurrentPrice)

	if va.FirstAcquiredDate.IsZero() {
		va.FirstAcquiredDate = time.Now()
	}

	va.LastUpdated = time.Now()
	va.UpdatedAt = time.Now()

	return nil
}

// ReducePosition reduces the existing position and realizes P&L
func (va *VaultAsset) ReducePosition(quantity decimal.Decimal, price decimal.Decimal) error {
	if quantity.IsZero() || quantity.IsNegative() {
		return errors.New("quantity to reduce must be positive")
	}
	if quantity.GreaterThan(va.Quantity) {
		return errors.New("cannot reduce more than current position")
	}
	if price.IsNegative() {
		return errors.New("price cannot be negative")
	}

	// Calculate cost basis and proceeds for reduced position
	costBasisForReduction := quantity.Mul(va.AvgCostBasis)
	proceeds := quantity.Mul(price)
	realizedPnL := proceeds.Sub(costBasisForReduction)

	// Update position
	va.Quantity = va.Quantity.Sub(quantity)
	va.TotalSold = va.TotalSold.Add(quantity)
	va.TotalProceeds = va.TotalProceeds.Add(proceeds)
	va.RealizedPnL = va.RealizedPnL.Add(realizedPnL)

	// Update cost basis for remaining position
	if va.Quantity.IsPositive() {
		va.TotalCost = va.TotalCost.Sub(costBasisForReduction)
		// Average cost basis remains the same for remaining shares
	} else {
		// Position completely closed
		va.Quantity = decimal.Zero
		va.TotalCost = decimal.Zero
		va.AvgCostBasis = decimal.Zero
	}

	va.CurrentMarketValue = va.Quantity.Mul(va.CurrentPrice)
	va.LastUpdated = time.Now()
	va.UpdatedAt = time.Now()

	return nil
}

// GetCurrentAllocation returns current allocation as a percentage of vault total AUM
func (va *VaultAsset) GetCurrentAllocation(vaultAUM decimal.Decimal) decimal.Decimal {
	if vaultAUM.IsZero() {
		return decimal.Zero
	}
	return va.CurrentMarketValue.Div(vaultAUM)
}

// IsOverAllocated checks if current allocation exceeds target
func (va *VaultAsset) IsOverAllocated(vaultAUM decimal.Decimal) bool {
	if va.TargetAllocation == nil || vaultAUM.IsZero() {
		return false
	}
	currentAlloc := va.GetCurrentAllocation(vaultAUM)
	return currentAlloc.GreaterThan(*va.TargetAllocation)
}

// IsUnderAllocated checks if current allocation is below target
func (va *VaultAsset) IsUnderAllocated(vaultAUM decimal.Decimal) bool {
	if va.TargetAllocation == nil || vaultAUM.IsZero() {
		return false
	}
	currentAlloc := va.GetCurrentAllocation(vaultAUM)
	return currentAlloc.LessThan(*va.TargetAllocation)
}

// GetRebalanceAmount calculates amount to rebalance to target allocation
func (va *VaultAsset) GetRebalanceAmount(vaultAUM decimal.Decimal) decimal.Decimal {
	if va.TargetAllocation == nil || va.CurrentPrice.IsZero() || vaultAUM.IsZero() {
		return decimal.Zero
	}

	targetValue := vaultAUM.Mul(*va.TargetAllocation)
	currentValue := va.CurrentMarketValue

	if currentValue.GreaterThan(targetValue) {
		// Sell excess
		excessValue := currentValue.Sub(targetValue)
		return excessValue.Div(va.CurrentPrice).Neg() // Negative for selling
	} else if currentValue.LessThan(targetValue) {
		// Buy to reach target
		shortfall := targetValue.Sub(currentValue)
		return shortfall.Div(va.CurrentPrice) // Positive for buying
	}

	return decimal.Zero
}

// VaultAssetFilter represents filters for querying vault assets
type VaultAssetFilter struct {
	VaultID          *string
	Asset            *string
	Account          *string
	MinQuantity      *decimal.Decimal
	MaxQuantity      *decimal.Decimal
	MinMarketValue   *decimal.Decimal
	MaxMarketValue   *decimal.Decimal
	HasUnrealizedPnL *bool
	HasRealizedPnL   *bool
	IsRebalancing    *bool
	StartDate        *time.Time
	EndDate          *time.Time
	Limit            int
	Offset           int
}

// VaultAssetSummary provides aggregated asset statistics for a vault
type VaultAssetSummary struct {
	TotalAssets          int             `json:"total_assets"`
	TotalMarketValue     decimal.Decimal `json:"total_market_value"`
	TotalUnrealizedPnL   decimal.Decimal `json:"total_unrealized_pnl"`
	TotalRealizedPnL     decimal.Decimal `json:"total_realized_pnl"`
	BestPerformingAsset  string          `json:"best_performing_asset"`
	WorstPerformingAsset string          `json:"worst_performing_asset"`
	LargestPosition      string          `json:"largest_position"`
	SmallestPosition     string          `json:"smallest_position"`
}