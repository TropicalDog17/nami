package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"gorm.io/gorm"
)

// TokenizedVaultServiceImpl implements the VaultService interface
type TokenizedVaultServiceImpl struct {
	db *gorm.DB
}

// NewTokenizedVaultService creates a new tokenized vault service
func NewTokenizedVaultService(db *gorm.DB) VaultService {
	return &TokenizedVaultServiceImpl{db: db}
}

// CreateVault creates a new tokenized vault
func (s *TokenizedVaultServiceImpl) CreateVault(ctx context.Context, vault *models.Vault) (*models.Vault, error) {
	if err := vault.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Generate ID if not provided
	if vault.ID == "" {
		vault.ID = generateUUID()
	}

	// Set timestamps
	now := time.Now()
	vault.CreatedAt = now
	vault.UpdatedAt = now

	// Set initial values if not provided
	if vault.InceptionDate.IsZero() {
		vault.InceptionDate = now
	}
	vault.LastUpdated = now

	// Preserve any precomputed AUM set by the handler (e.g., initial_total_value)
	// Only default to zero if it's not already set.
	if vault.TotalAssetsUnderManagement.IsZero() {
		vault.TotalAssetsUnderManagement = decimal.Zero
	}

	// Initialize high watermark to initial share price if not set
	if vault.HighWatermark.IsZero() && !vault.InitialSharePrice.IsZero() {
		vault.HighWatermark = vault.InitialSharePrice
	}

	if vault.ManualPricingReferencePrice.IsZero() {
		vault.ManualPricingReferencePrice = vault.InitialSharePrice
	}

	if err := s.db.WithContext(ctx).Create(vault).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault: %w", err)
	}

	return vault, nil
}

// GetVaultByID retrieves a vault by ID
func (s *TokenizedVaultServiceImpl) GetVaultByID(ctx context.Context, id string) (*models.Vault, error) {
	var vault models.Vault
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&vault).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("vault not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}
	return &vault, nil
}

// GetVaults retrieves vaults based on filter
func (s *TokenizedVaultServiceImpl) GetVaults(ctx context.Context, filter *models.VaultFilter) ([]*models.Vault, error) {
	var vaults []models.Vault
	query := s.db.WithContext(ctx).Model(&models.Vault{})

	// Apply filters
	if filter != nil {
		if filter.Type != nil {
			query = query.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil {
			query = query.Where("status = ?", *filter.Status)
		}
		if filter.CreatedBy != nil {
			query = query.Where("created_by = ?", *filter.CreatedBy)
		}
		if filter.MinAUM != nil {
			query = query.Where("total_assets_under_management >= ?", *filter.MinAUM)
		}
		if filter.MaxAUM != nil {
			query = query.Where("total_assets_under_management <= ?", *filter.MaxAUM)
		}
		if filter.IsDepositAllowed != nil {
			query = query.Where("is_deposit_allowed = ?", *filter.IsDepositAllowed)
		}
		if filter.IsWithdrawalAllowed != nil {
			query = query.Where("is_withdrawal_allowed = ?", *filter.IsWithdrawalAllowed)
		}
		if filter.StartDate != nil {
			query = query.Where("inception_date >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("inception_date <= ?", *filter.EndDate)
		}
	}

	// Add ordering
	query = query.Order("created_at DESC")

	// Apply pagination
	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	err := query.Find(&vaults).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get vaults: %w", err)
	}

	// Convert to pointers
	result := make([]*models.Vault, len(vaults))
	for i := range vaults {
		result[i] = &vaults[i]
	}

	return result, nil
}

// UpdateVault updates an existing vault
func (s *TokenizedVaultServiceImpl) UpdateVault(ctx context.Context, vault *models.Vault) error {
	if err := vault.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	vault.UpdatedAt = time.Now()

	result := s.db.WithContext(ctx).Save(vault)
	if result.Error != nil {
		return fmt.Errorf("failed to update vault: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault not found: %s", vault.ID)
	}

	return nil
}

// DeleteVault deletes a vault
func (s *TokenizedVaultServiceImpl) DeleteVault(ctx context.Context, id string) error {
	result := s.db.WithContext(ctx).Delete(&models.Vault{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vault: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault not found: %s", id)
	}

	return nil
}

// GetVaultSummary retrieves vault summary statistics
func (s *TokenizedVaultServiceImpl) GetVaultSummary(ctx context.Context, filter *models.VaultFilter) (*models.VaultSummary, error) {
	var summary models.VaultSummary

	// Count total vaults
	var totalCount int64
	query := s.db.WithContext(ctx).Model(&models.Vault{})
	if filter != nil {
		if filter.Type != nil {
			query = query.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil {
			query = query.Where("status = ?", *filter.Status)
		}
	}
	query.Count(&totalCount)
	summary.TotalVaults = int(totalCount)

	// Count active vaults
	var activeCount int64
	activeQuery := s.db.WithContext(ctx).Model(&models.Vault{}).Where("status = ?", models.VaultStatusActive)
	if filter != nil {
		if filter.Type != nil {
			activeQuery = activeQuery.Where("type = ?", *filter.Type)
		}
	}
	activeQuery.Count(&activeCount)
	summary.ActiveVaults = int(activeCount)

	// Calculate total AUM and shares
	var result struct {
		TotalAUM      decimal.Decimal `json:"total_aum"`
		TotalShares   decimal.Decimal `json:"total_shares"`
		AvgSharePrice decimal.Decimal `json:"avg_share_price"`
	}

	aumQuery := s.db.WithContext(ctx).Model(&models.Vault{}).Select(
		"COALESCE(SUM(total_assets_under_management), 0) as total_aum, " +
			"COALESCE(SUM(total_supply), 0) as total_shares, " +
			"CASE WHEN COUNT(*) > 0 AND SUM(total_supply) > 0 THEN SUM(total_assets_under_management) / SUM(total_supply) ELSE 0 END as avg_share_price",
	)

	if filter != nil {
		if filter.Type != nil {
			aumQuery = aumQuery.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil {
			aumQuery = aumQuery.Where("status = ?", *filter.Status)
		}
	}

	err := aumQuery.Scan(&result).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get summary stats: %w", err)
	}

	summary.TotalAUM = result.TotalAUM
	summary.TotalSharesOutstanding = result.TotalShares
	summary.AverageSharePrice = result.AvgSharePrice

	// Find best and worst performing vaults (by performance_since_inception)
	var perfResult struct {
		BestVault  string `json:"best_vault"`
		WorstVault string `json:"worst_vault"`
	}

	var perfQuery *gorm.DB

	if filter != nil && filter.Type != nil {
		// Use subqueries with type filter
		perfQuery = s.db.WithContext(ctx).Raw(`
			SELECT
				(SELECT name FROM vaults WHERE initial_share_price > 0 AND type = ? ORDER BY current_share_price / initial_share_price DESC LIMIT 1) as best_vault,
				(SELECT name FROM vaults WHERE initial_share_price > 0 AND type = ? ORDER BY current_share_price / initial_share_price ASC LIMIT 1) as worst_vault
		`, *filter.Type, *filter.Type)
	} else {
		// Use subqueries without type filter
		perfQuery = s.db.WithContext(ctx).Raw(`
			SELECT
				(SELECT name FROM vaults WHERE initial_share_price > 0 ORDER BY current_share_price / initial_share_price DESC LIMIT 1) as best_vault,
				(SELECT name FROM vaults WHERE initial_share_price > 0 ORDER BY current_share_price / initial_share_price ASC LIMIT 1) as worst_vault
		`)
	}

	// Note: This is a simplified approach. In production, you might want separate queries
	if err := perfQuery.Scan(&perfResult).Error; err == nil && perfResult.BestVault != "" {
		summary.BestPerformingVault = perfResult.BestVault
		summary.WorstPerformingVault = perfResult.WorstVault
	}

	return &summary, nil
}

// Helper function to generate UUID (simplified version)
func generateUUID() string {
	return fmt.Sprintf("vault_%d", time.Now().UnixNano())
}

// TokenizedVaultShareServiceImpl implements VaultShareService
type TokenizedVaultShareServiceImpl struct {
	db *gorm.DB
}

// NewTokenizedVaultShareService creates a new tokenized vault share service
func NewTokenizedVaultShareService(db *gorm.DB) VaultShareService {
	return &TokenizedVaultShareServiceImpl{db: db}
}

// CreateVaultShare creates a new vault share record
func (s *TokenizedVaultShareServiceImpl) CreateVaultShare(ctx context.Context, share *models.VaultShare) (*models.VaultShare, error) {
	if err := share.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	if share.ID == "" {
		share.ID = generateUUID()
	}

	now := time.Now()
	share.CreatedAt = now
	share.UpdatedAt = now
	share.LastActivityDate = now

	if err := s.db.WithContext(ctx).Create(share).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault share: %w", err)
	}

	return share, nil
}

// GetVaultShareByID retrieves a vault share by ID
func (s *TokenizedVaultShareServiceImpl) GetVaultShareByID(ctx context.Context, id string) (*models.VaultShare, error) {
	var share models.VaultShare
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&share).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("vault share not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get vault share: %w", err)
	}
	return &share, nil
}

// GetVaultShares retrieves vault shares based on filter
func (s *TokenizedVaultShareServiceImpl) GetVaultShares(ctx context.Context, filter *models.VaultShareFilter) ([]*models.VaultShare, error) {
	var shares []models.VaultShare
	query := s.db.WithContext(ctx).Model(&models.VaultShare{})

	// Apply filters
	if filter != nil {
		if filter.VaultID != nil {
			query = query.Where("vault_id = ?", *filter.VaultID)
		}
		if filter.UserID != nil {
			query = query.Where("user_id = ?", *filter.UserID)
		}
		if filter.MinShareBalance != nil {
			query = query.Where("share_balance >= ?", *filter.MinShareBalance)
		}
		if filter.MaxShareBalance != nil {
			query = query.Where("share_balance <= ?", *filter.MaxShareBalance)
		}
		if filter.MinMarketValue != nil {
			query = query.Where("current_market_value >= ?", *filter.MinMarketValue)
		}
		if filter.MaxMarketValue != nil {
			query = query.Where("current_market_value <= ?", *filter.MaxMarketValue)
		}
		if filter.HasUnrealizedPnL != nil {
			if *filter.HasUnrealizedPnL {
				query = query.Where("unrealized_pnl != 0")
			} else {
				query = query.Where("unrealized_pnl = 0")
			}
		}
		if filter.HasRealizedPnL != nil {
			if *filter.HasRealizedPnL {
				query = query.Where("realized_pnl != 0")
			} else {
				query = query.Where("realized_pnl = 0")
			}
		}
		if filter.StartDate != nil {
			query = query.Where("first_deposit_date >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("first_deposit_date <= ?", *filter.EndDate)
		}
	}

	query = query.Order("created_at DESC")

	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	err := query.Find(&shares).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get vault shares: %w", err)
	}

	result := make([]*models.VaultShare, len(shares))
	for i := range shares {
		result[i] = &shares[i]
	}

	return result, nil
}

// UpdateVaultShare updates an existing vault share
func (s *TokenizedVaultShareServiceImpl) UpdateVaultShare(ctx context.Context, share *models.VaultShare) error {
	if err := share.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	share.UpdatedAt = time.Now()
	share.LastActivityDate = time.Now()

	result := s.db.WithContext(ctx).Save(share)
	if result.Error != nil {
		return fmt.Errorf("failed to update vault share: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault share not found: %s", share.ID)
	}

	return nil
}

// DeleteVaultShare deletes a vault share
func (s *TokenizedVaultShareServiceImpl) DeleteVaultShare(ctx context.Context, id string) error {
	result := s.db.WithContext(ctx).Delete(&models.VaultShare{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vault share: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault share not found: %s", id)
	}

	return nil
}

// GetUserVaultShares retrieves vault shares for a specific user
func (s *TokenizedVaultShareServiceImpl) GetUserVaultShares(ctx context.Context, userID string) ([]*models.VaultShare, error) {
	var shares []models.VaultShare
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&shares).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user vault shares: %w", err)
	}

	result := make([]*models.VaultShare, len(shares))
	for i := range shares {
		result[i] = &shares[i]
	}

	return result, nil
}

// MintShares mints new shares for a user in a vault
func (s *TokenizedVaultShareServiceImpl) MintShares(ctx context.Context, vaultID, userID string, shares, costPerShare decimal.Decimal) (*models.VaultShare, error) {
	if shares.IsZero() || shares.IsNegative() {
		return nil, errors.New("shares to mint must be positive")
	}
	if costPerShare.IsNegative() {
		return nil, errors.New("cost per share cannot be negative")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Find existing or create new share record
	var vaultShare models.VaultShare
	err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&vaultShare).Error
	isNewRecord := false
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Create new share record
			isNewRecord = true
			vaultShare = models.VaultShare{
				ID:           generateUUID(),
				VaultID:      vaultID,
				UserID:       userID,
				ShareBalance: decimal.Zero,
				CostBasis:    decimal.Zero,
				CreatedAt:    time.Now(),
			}
		} else {
			return nil, fmt.Errorf("failed to check existing shares: %w", err)
		}
	}

	// Mint shares
	if err := vaultShare.MintShares(shares, costPerShare); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to mint shares: %w", err)
	}

	// Save share record - use appropriate method based on whether it's new or existing
	var saveErr error
	if isNewRecord {
		saveErr = tx.Create(&vaultShare).Error
	} else {
		saveErr = tx.Save(&vaultShare).Error
	}
	if saveErr != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to save vault share: %w", saveErr)
	}

	// Update vault total supply
	vault := &models.Vault{}
	if err := tx.Where("id = ?", vaultID).First(vault).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}

	vault.TotalSupply = vault.TotalSupply.Add(shares)
	vault.TotalAssetsUnderManagement = vault.TotalSupply.Mul(vault.CurrentSharePrice)
	vault.LastUpdated = time.Now()

	if err := tx.Save(vault).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to update vault: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &vaultShare, nil
}

// BurnShares burns shares for a user in a vault
func (s *TokenizedVaultShareServiceImpl) BurnShares(ctx context.Context, vaultID, userID string, shares, marketValuePerShare decimal.Decimal) (*models.VaultShare, error) {
	if shares.IsZero() || shares.IsNegative() {
		return nil, errors.New("shares to burn must be positive")
	}
	if marketValuePerShare.IsNegative() {
		return nil, errors.New("market value per share cannot be negative")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Get existing share record
	var vaultShare models.VaultShare
	err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&vaultShare).Error
	if err != nil {
		tx.Rollback()
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("no vault shares found for user: %s", userID)
		}
		return nil, fmt.Errorf("failed to get vault shares: %w", err)
	}

	// Burn shares
	if err := vaultShare.BurnShares(shares, marketValuePerShare); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to burn shares: %w", err)
	}

	// Save share record
	if err := tx.Save(&vaultShare).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to save vault share: %w", err)
	}

	// Update vault total supply
	vault := &models.Vault{}
	if err := tx.Where("id = ?", vaultID).First(vault).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}

	newSupply := vault.TotalSupply.Sub(shares)
	if newSupply.IsNegative() {
		tx.Rollback()
		return nil, errors.New("cannot burn more shares than exist")
	}

	vault.TotalSupply = newSupply
	vault.TotalAssetsUnderManagement = vault.TotalSupply.Mul(vault.CurrentSharePrice)
	vault.LastUpdated = time.Now()

	if err := tx.Save(vault).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to update vault: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &vaultShare, nil
}

// GetShareHistory retrieves share transaction history
func (s *TokenizedVaultShareServiceImpl) GetShareHistory(ctx context.Context, vaultID, userID string) ([]*models.VaultShareHistory, error) {
	var history []models.VaultShareHistory
	query := s.db.WithContext(ctx).Model(&models.VaultShareHistory{})

	query = query.Where("vault_id = ? AND user_id = ?", vaultID, userID)
	query = query.Order("timestamp DESC")

	err := query.Find(&history).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get share history: %w", err)
	}

	result := make([]*models.VaultShareHistory, len(history))
	for i := range history {
		result[i] = &history[i]
	}

	return result, nil
}
