package repositories

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"gorm.io/gorm"
)

type investmentRepository struct {
	db *db.DB
}

// NewInvestmentRepository creates a new investment repository
func NewInvestmentRepository(database *db.DB) InvestmentRepository {
	return &investmentRepository{db: database}
}

// Create creates a new investment record
func (r *investmentRepository) Create(ctx context.Context, investment *models.Investment) error {
	if err := r.db.WithContext(ctx).Create(investment).Error; err != nil {
		return fmt.Errorf("failed to create investment: %w", err)
	}
	return nil
}

// GetByID retrieves an investment by ID
func (r *investmentRepository) GetByID(ctx context.Context, id string) (*models.Investment, error) {
	var investment models.Investment
	if err := r.db.WithContext(ctx).First(&investment, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("investment not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get investment: %w", err)
	}
	return &investment, nil
}

// GetByAssetAccount retrieves investments by asset and account
func (r *investmentRepository) GetByAssetAccount(ctx context.Context, asset, account string, isOpen *bool) ([]*models.Investment, error) {
	query := r.db.WithContext(ctx).Where("asset = ? AND account = ?", asset, account)

	if isOpen != nil {
		query = query.Where("is_open = ?", *isOpen)
	}

	var investments []*models.Investment
	if err := query.Order("deposit_date DESC").Find(&investments).Error; err != nil {
		return nil, fmt.Errorf("failed to get investments by asset/account: %w", err)
	}

	return investments, nil
}

// List retrieves investments based on filter criteria
func (r *investmentRepository) List(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error) {
	query := r.db.WithContext(ctx)

	// Apply filters
	if filter != nil {
		if filter.Asset != "" {
			query = query.Where("asset = ?", filter.Asset)
		}

		if filter.Account != "" {
			query = query.Where("account = ?", filter.Account)
		}

		if filter.Horizon != "" {
			query = query.Where("horizon = ?", filter.Horizon)
		}

		if filter.IsOpen != nil {
			query = query.Where("is_open = ?", *filter.IsOpen)
		}

		if filter.IsVault != nil {
			query = query.Where("is_vault = ?", *filter.IsVault)
		}

		if filter.VaultStatus != nil {
			query = query.Where("vault_status = ?", *filter.VaultStatus)
		}

		if filter.CostBasisMethod != "" {
			query = query.Where("cost_basis_method = ?", filter.CostBasisMethod)
		}

		if filter.StartDate != nil {
			query = query.Where("deposit_date >= ?", *filter.StartDate)
		}

		if filter.EndDate != nil {
			query = query.Where("deposit_date <= ?", *filter.EndDate)
		}
	}

	// Order by deposit date descending
	query = query.Order("deposit_date DESC")

	// Apply pagination
	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	var investments []*models.Investment
	if err := query.Find(&investments).Error; err != nil {
		return nil, fmt.Errorf("failed to list investments: %w", err)
	}

	return investments, nil
}

// GetCount returns the count of investments matching the filter
func (r *investmentRepository) GetCount(ctx context.Context, filter *models.InvestmentFilter) (int, error) {
	query := r.db.WithContext(ctx).Model(&models.Investment{})

	// Apply filters (same as List method)
	if filter != nil {
		if filter.Asset != "" {
			query = query.Where("asset = ?", filter.Asset)
		}

		if filter.Account != "" {
			query = query.Where("account = ?", filter.Account)
		}

		if filter.Horizon != "" {
			query = query.Where("horizon = ?", filter.Horizon)
		}

		if filter.IsOpen != nil {
			query = query.Where("is_open = ?", *filter.IsOpen)
		}

		if filter.CostBasisMethod != "" {
			query = query.Where("cost_basis_method = ?", filter.CostBasisMethod)
		}

		if filter.StartDate != nil {
			query = query.Where("deposit_date >= ?", *filter.StartDate)
		}

		if filter.EndDate != nil {
			query = query.Where("deposit_date <= ?", *filter.EndDate)
		}
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to get investment count: %w", err)
	}

	return int(count), nil
}

// Update updates an investment record
func (r *investmentRepository) Update(ctx context.Context, investment *models.Investment) error {
	investment.UpdatedAt = time.Now()

	result := r.db.WithContext(ctx).Model(&models.Investment{}).Where("id = ?", investment.ID).Updates(investment)
	if result.Error != nil {
		return fmt.Errorf("failed to update investment: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("investment not found: %s", investment.ID)
	}

	return nil
}

// Delete deletes an investment record
func (r *investmentRepository) Delete(ctx context.Context, id string) error {
	result := r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.Investment{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete investment: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("investment not found: %s", id)
	}

	return nil
}

// GetSummary returns investment summary statistics
func (r *investmentRepository) GetSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error) {
	// TODO: Implement using GORM aggregation queries
	return &models.InvestmentSummary{}, fmt.Errorf("not implemented yet")
}

// FindByDepositID finds an investment by deposit ID
func (r *investmentRepository) FindByDepositID(ctx context.Context, depositID string) (*models.Investment, error) {
	var investment models.Investment

	// Find investment that has a transaction with this deposit ID
	err := r.db.WithContext(ctx).
		Joins("JOIN transactions ON investments.id = transactions.investment_id").
		Where("transactions.deposit_id = ?", depositID).
		First(&investment).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("investment not found for deposit ID: %s", depositID)
		}
		return nil, fmt.Errorf("failed to find investment by deposit ID: %w", err)
	}

	return &investment, nil
}

// CreateFromStake creates an investment from a stake transaction
func (r *investmentRepository) CreateFromStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error) {
	investment := &models.Investment{
		ID:                  uuid.New().String(),
		Asset:               stakeTx.Asset,
		Account:             stakeTx.Account,
		Horizon:             stakeTx.Horizon,
		DepositDate:         stakeTx.Date,
		DepositQty:          stakeTx.Quantity,
		DepositCost:         stakeTx.AmountUSD,
		DepositUnitCost:     stakeTx.AmountUSD.Div(stakeTx.Quantity),
		WithdrawalQty:       decimal.Zero,
		WithdrawalValue:     decimal.Zero,
		WithdrawalUnitPrice: decimal.Zero,
		PnL:                 decimal.Zero,
		PnLPercent:          decimal.Zero,
		IsOpen:              true,
		CostBasisMethod:     models.CostBasisFIFO,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	err := r.db.WithContext(ctx).Create(investment).Error
	if err != nil {
		return nil, fmt.Errorf("failed to create investment from stake: %w", err)
	}

	return investment, nil
}

// FindOpenInvestmentForStake finds an open investment for staking
func (r *investmentRepository) FindOpenInvestmentForStake(ctx context.Context, asset, account, horizon string) (*models.Investment, error) {
	var investment models.Investment

	query := r.db.WithContext(ctx).Where("asset = ? AND account = ? AND is_open = ?", asset, account, true)

	if horizon != "" {
		query = query.Where("horizon = ?", horizon)
	} else {
		query = query.Where("horizon IS NULL")
	}

	err := query.Order("deposit_date ASC").First(&investment).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // No open investment found
		}
		return nil, fmt.Errorf("failed to find open investment for stake: %w", err)
	}

	return &investment, nil
}

// UpdateWithStake updates an investment with a stake transaction
func (r *investmentRepository) UpdateWithStake(ctx context.Context, investment *models.Investment, stakeTx *models.Transaction) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Update investment with additional stake
		investment.AddDeposit(stakeTx.Quantity, stakeTx.AmountUSD)

		// Save the updated investment
		if err := tx.Save(investment).Error; err != nil {
			return fmt.Errorf("failed to update investment: %w", err)
		}

		return nil
	})
}

// UpdateWithUnstake updates an investment with an unstake transaction
func (r *investmentRepository) UpdateWithUnstake(ctx context.Context, investment *models.Investment, unstakeTx *models.Transaction) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Update investment with unstake
		err := investment.AddWithdrawal(unstakeTx.Quantity, unstakeTx.AmountUSD)
		if err != nil {
			return fmt.Errorf("failed to process withdrawal: %w", err)
		}

		// Set withdrawal date
		investment.WithdrawalDate = &unstakeTx.Date

		// If fully withdrawn or over-withdrawn, mark as closed
		remaining := investment.DepositQty.Sub(investment.WithdrawalQty)
		if !remaining.IsPositive() {
			investment.IsOpen = false
		}

		// Save the updated investment
		if err := tx.Save(investment).Error; err != nil {
			return fmt.Errorf("failed to update investment: %w", err)
		}

		return nil
	})
}

// GetOpenInvestments returns all open investments
func (r *investmentRepository) GetOpenInvestments(ctx context.Context) ([]*models.Investment, error) {
	var investments []*models.Investment
	if err := r.db.WithContext(ctx).Where("is_open = ?", true).Find(&investments).Error; err != nil {
		return nil, fmt.Errorf("failed to get open investments: %w", err)
	}
	return investments, nil
}

// GetInvestmentsByAsset returns all investments for a specific asset
func (r *investmentRepository) GetInvestmentsByAsset(ctx context.Context, asset string) ([]*models.Investment, error) {
	var investments []*models.Investment
	if err := r.db.WithContext(ctx).Where("asset = ?", asset).Find(&investments).Error; err != nil {
		return nil, fmt.Errorf("failed to get investments by asset: %w", err)
	}
	return investments, nil
}

// GetInvestmentsByAccount returns all investments for a specific account
func (r *investmentRepository) GetInvestmentsByAccount(ctx context.Context, account string) ([]*models.Investment, error) {
	var investments []*models.Investment
	if err := r.db.WithContext(ctx).Where("account = ?", account).Find(&investments).Error; err != nil {
		return nil, fmt.Errorf("failed to get investments by account: %w", err)
	}
	return investments, nil
}

// Vault-specific repository methods

// CreateVault creates a new vault (investment with IsVault = true)
func (r *investmentRepository) CreateVault(ctx context.Context, vault *models.Investment) error {
	vault.IsVault = true
	if vault.VaultStatus == nil {
		status := string(models.VaultStatusActive)
		vault.VaultStatus = &status
	}

	if err := r.db.WithContext(ctx).Create(vault).Error; err != nil {
		return fmt.Errorf("failed to create vault: %w", err)
	}
	return nil
}

// GetVaultByName retrieves a vault by name
func (r *investmentRepository) GetVaultByName(ctx context.Context, name string) (*models.Investment, error) {
	var vault models.Investment
	if err := r.db.WithContext(ctx).Where("is_vault = ? AND vault_name = ?", true, name).First(&vault).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("vault not found: %s", name)
		}
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}
	return &vault, nil
}

// GetActiveVaults returns all active vaults
func (r *investmentRepository) GetActiveVaults(ctx context.Context) ([]*models.Investment, error) {
	var vaults []*models.Investment
	if err := r.db.WithContext(ctx).Where("is_vault = ? AND vault_status = ? AND is_open = ?", true, string(models.VaultStatusActive), true).Find(&vaults).Error; err != nil {
		return nil, fmt.Errorf("failed to get active vaults: %w", err)
	}
	return vaults, nil
}

// GetVaultsByStatus returns vaults by status
func (r *investmentRepository) GetVaultsByStatus(ctx context.Context, status models.VaultStatus) ([]*models.Investment, error) {
	var vaults []*models.Investment
	if err := r.db.WithContext(ctx).Where("is_vault = ? AND vault_status = ?", true, string(status)).Find(&vaults).Error; err != nil {
		return nil, fmt.Errorf("failed to get vaults by status: %w", err)
	}
	return vaults, nil
}

// UpdateVault updates a vault
func (r *investmentRepository) UpdateVault(ctx context.Context, vault *models.Investment) error {
	if err := r.db.WithContext(ctx).Save(vault).Error; err != nil {
		return fmt.Errorf("failed to update vault: %w", err)
	}
	return nil
}

// DeleteVault deletes a vault by ID
func (r *investmentRepository) DeleteVault(ctx context.Context, id string) error {
	if err := r.db.WithContext(ctx).Where("id = ? AND is_vault = ?", id, true).Delete(&models.Investment{}).Error; err != nil {
		return fmt.Errorf("failed to delete vault: %w", err)
	}
	return nil
}

// DeleteTransactionsByInvestmentID deletes all transactions related to an investment
func (r *investmentRepository) DeleteTransactionsByInvestmentID(ctx context.Context, investmentID string) error {
	if err := r.db.WithContext(ctx).Where("investment_id = ?", investmentID).Delete(&models.Transaction{}).Error; err != nil {
		return fmt.Errorf("failed to delete related transactions: %w", err)
	}
	return nil
}
