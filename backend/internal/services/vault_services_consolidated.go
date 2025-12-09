package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"gorm.io/gorm"
)

// ============================================================================
// VaultServicesConsolidated - Unified interface for all vault operations
// ============================================================================
// This consolidated service improves testability by:
// 1. Providing a single entry point for vault operations
// 2. Enabling dependency injection for easier mocking
// 3. Centralizing transaction management and consistency checks
// 4. Providing clear separation of concerns

// VaultServicesConsolidated provides a unified interface for vault operations
type VaultServicesConsolidated interface {
	// Vault operations
	CreateVault(ctx context.Context, vault *models.Vault) (*models.Vault, error)
	GetVault(ctx context.Context, vaultID string) (*models.Vault, error)
	ListVaults(ctx context.Context, filter *models.VaultFilter) ([]*models.Vault, error)
	UpdateVault(ctx context.Context, vault *models.Vault) error
	DeleteVault(ctx context.Context, vaultID string) error

	// Vault share operations
	CreateVaultShare(ctx context.Context, share *models.VaultShare) (*models.VaultShare, error)
	GetVaultShare(ctx context.Context, shareID string) (*models.VaultShare, error)
	GetUserVaultShares(ctx context.Context, userID string) ([]*models.VaultShare, error)
	GetVaultShares(ctx context.Context, vaultID string) ([]*models.VaultShare, error)
	UpdateVaultShare(ctx context.Context, share *models.VaultShare) error

	// Vault asset operations
	CreateVaultAsset(ctx context.Context, asset *models.VaultAsset) (*models.VaultAsset, error)
	GetVaultAsset(ctx context.Context, assetID string) (*models.VaultAsset, error)
	GetVaultAssets(ctx context.Context, vaultID string) ([]*models.VaultAsset, error)
	UpdateVaultAsset(ctx context.Context, asset *models.VaultAsset) error

	// Vault transaction operations
	CreateTransaction(ctx context.Context, tx *models.VaultTransaction) (*models.VaultTransaction, error)
	GetTransaction(ctx context.Context, txID string) (*models.VaultTransaction, error)
	GetVaultTransactions(ctx context.Context, vaultID string) ([]*models.VaultTransaction, error)
	GetUserTransactions(ctx context.Context, userID string) ([]*models.VaultTransaction, error)
	ListTransactions(ctx context.Context, filter *models.VaultTransactionFilter) ([]*models.VaultTransaction, error)

	// Composite operations (with consistency guarantees)
	ProcessDeposit(ctx context.Context, vaultID, userID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error)
	ProcessWithdrawal(ctx context.Context, vaultID, userID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error)
	ProcessYield(ctx context.Context, vaultID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, error)
	ProcessFee(ctx context.Context, vaultID string, feeAmount decimal.Decimal, feeType string, feeRate decimal.Decimal) (*models.VaultTransaction, error)

	// State recalculation
	RecalculateVaultState(ctx context.Context, vaultID string) error
	RecalculateUserHoldings(ctx context.Context, vaultID, userID string) error
	RecalculateAssetHoldings(ctx context.Context, vaultID, asset, account string) error

	// Reporting
	GetVaultSummary(ctx context.Context, vaultID string) (*models.VaultSummary, error)
	// deprecated from this implementation; not used by handlers
	// GetUserVaultSummary(ctx context.Context, vaultID, userID string) (*models.UserVaultSummary, error)
	GetTransactionSummary(ctx context.Context, filter *models.VaultTransactionFilter) (*models.VaultTransactionSummary, error)
}

// VaultServicesConsolidatedImpl implements VaultServicesConsolidated
type VaultServicesConsolidatedImpl struct {
	db *gorm.DB
}

// NewVaultServicesConsolidated creates a new consolidated vault services instance
func NewVaultServicesConsolidated(db *gorm.DB) VaultServicesConsolidated {
	return &VaultServicesConsolidatedImpl{db: db}
}

// ============================================================================
// Vault Operations
// ============================================================================

func (s *VaultServicesConsolidatedImpl) CreateVault(ctx context.Context, vault *models.Vault) (*models.Vault, error) {
	if vault == nil {
		return nil, errors.New("vault cannot be nil")
	}

	if vault.ID == "" {
		vault.ID = uuid.NewString()
	}

	now := time.Now()
	vault.CreatedAt = now
	vault.UpdatedAt = now
	vault.LastUpdated = now

	if err := s.db.WithContext(ctx).Create(vault).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault: %w", err)
	}

	return vault, nil
}

func (s *VaultServicesConsolidatedImpl) GetVault(ctx context.Context, vaultID string) (*models.Vault, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	var vault models.Vault
	if err := s.db.WithContext(ctx).Where("id = ?", vaultID).First(&vault).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("vault not found: %s", vaultID)
		}
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}

	return &vault, nil
}

func (s *VaultServicesConsolidatedImpl) ListVaults(ctx context.Context, filter *models.VaultFilter) ([]*models.Vault, error) {
	var vaults []models.Vault
	query := s.db.WithContext(ctx)

	if filter != nil {
		if filter.Status != nil {
			query = query.Where("status = ?", string(*filter.Status))
		}
		if filter.Type != nil {
			query = query.Where("type = ?", string(*filter.Type))
		}
		if filter.CreatedBy != nil {
			query = query.Where("created_by = ?", *filter.CreatedBy)
		}
	}

	if err := query.Find(&vaults).Error; err != nil {
		return nil, fmt.Errorf("failed to list vaults: %w", err)
	}

	result := make([]*models.Vault, len(vaults))
	for i := range vaults {
		result[i] = &vaults[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) UpdateVault(ctx context.Context, vault *models.Vault) error {
	if vault == nil || vault.ID == "" {
		return errors.New("vault and vault ID cannot be nil/empty")
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

func (s *VaultServicesConsolidatedImpl) DeleteVault(ctx context.Context, vaultID string) error {
	if vaultID == "" {
		return errors.New("vault ID cannot be empty")
	}

	result := s.db.WithContext(ctx).Delete(&models.Vault{}, "id = ?", vaultID)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vault: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault not found: %s", vaultID)
	}

	return nil
}

// ============================================================================
// Vault Share Operations
// ============================================================================

func (s *VaultServicesConsolidatedImpl) CreateVaultShare(ctx context.Context, share *models.VaultShare) (*models.VaultShare, error) {
	if share == nil {
		return nil, errors.New("vault share cannot be nil")
	}

	if share.ID == "" {
		share.ID = uuid.NewString()
	}

	now := time.Now()
	share.CreatedAt = now
	share.UpdatedAt = now

	if err := s.db.WithContext(ctx).Create(share).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault share: %w", err)
	}

	return share, nil
}

func (s *VaultServicesConsolidatedImpl) GetVaultShare(ctx context.Context, shareID string) (*models.VaultShare, error) {
	if shareID == "" {
		return nil, errors.New("share ID cannot be empty")
	}

	var share models.VaultShare
	if err := s.db.WithContext(ctx).Where("id = ?", shareID).First(&share).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("vault share not found: %s", shareID)
		}
		return nil, fmt.Errorf("failed to get vault share: %w", err)
	}

	return &share, nil
}

func (s *VaultServicesConsolidatedImpl) GetUserVaultShares(ctx context.Context, userID string) ([]*models.VaultShare, error) {
	if userID == "" {
		return nil, errors.New("user ID cannot be empty")
	}

	var shares []models.VaultShare
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&shares).Error; err != nil {
		return nil, fmt.Errorf("failed to get user vault shares: %w", err)
	}

	result := make([]*models.VaultShare, len(shares))
	for i := range shares {
		result[i] = &shares[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) GetVaultShares(ctx context.Context, vaultID string) ([]*models.VaultShare, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	var shares []models.VaultShare
	if err := s.db.WithContext(ctx).Where("vault_id = ?", vaultID).Find(&shares).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault shares: %w", err)
	}

	result := make([]*models.VaultShare, len(shares))
	for i := range shares {
		result[i] = &shares[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) UpdateVaultShare(ctx context.Context, share *models.VaultShare) error {
	if share == nil || share.ID == "" {
		return errors.New("vault share and share ID cannot be nil/empty")
	}

	share.UpdatedAt = time.Now()

	result := s.db.WithContext(ctx).Save(share)
	if result.Error != nil {
		return fmt.Errorf("failed to update vault share: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault share not found: %s", share.ID)
	}

	return nil
}

// ============================================================================
// Vault Asset Operations
// ============================================================================

func (s *VaultServicesConsolidatedImpl) CreateVaultAsset(ctx context.Context, asset *models.VaultAsset) (*models.VaultAsset, error) {
	if asset == nil {
		return nil, errors.New("vault asset cannot be nil")
	}

	if asset.ID == "" {
		asset.ID = uuid.NewString()
	}

	now := time.Now()
	asset.CreatedAt = now
	asset.UpdatedAt = now

	if err := s.db.WithContext(ctx).Create(asset).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault asset: %w", err)
	}

	return asset, nil
}

func (s *VaultServicesConsolidatedImpl) GetVaultAsset(ctx context.Context, assetID string) (*models.VaultAsset, error) {
	if assetID == "" {
		return nil, errors.New("asset ID cannot be empty")
	}

	var asset models.VaultAsset
	if err := s.db.WithContext(ctx).Where("id = ?", assetID).First(&asset).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("vault asset not found: %s", assetID)
		}
		return nil, fmt.Errorf("failed to get vault asset: %w", err)
	}

	return &asset, nil
}

func (s *VaultServicesConsolidatedImpl) GetVaultAssets(ctx context.Context, vaultID string) ([]*models.VaultAsset, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	var assets []models.VaultAsset
	if err := s.db.WithContext(ctx).Where("vault_id = ?", vaultID).Find(&assets).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault assets: %w", err)
	}

	result := make([]*models.VaultAsset, len(assets))
	for i := range assets {
		result[i] = &assets[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) UpdateVaultAsset(ctx context.Context, asset *models.VaultAsset) error {
	if asset == nil || asset.ID == "" {
		return errors.New("vault asset and asset ID cannot be nil/empty")
	}

	asset.UpdatedAt = time.Now()

	result := s.db.WithContext(ctx).Save(asset)
	if result.Error != nil {
		return fmt.Errorf("failed to update vault asset: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("vault asset not found: %s", asset.ID)
	}

	return nil
}

// ============================================================================
// Vault Transaction Operations
// ============================================================================

func (s *VaultServicesConsolidatedImpl) CreateTransaction(ctx context.Context, tx *models.VaultTransaction) (*models.VaultTransaction, error) {
	if tx == nil {
		return nil, errors.New("vault transaction cannot be nil")
	}

	if err := tx.Validate(); err != nil {
		return nil, fmt.Errorf("transaction validation failed: %w", err)
	}

	if tx.ID == "" {
		tx.ID = uuid.NewString()
	}

	now := time.Now()
	tx.Timestamp = now
	tx.CreatedAt = now
	tx.UpdatedAt = now

	if err := s.db.WithContext(ctx).Create(tx).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault transaction: %w", err)
	}

	return tx, nil
}

func (s *VaultServicesConsolidatedImpl) GetTransaction(ctx context.Context, txID string) (*models.VaultTransaction, error) {
	if txID == "" {
		return nil, errors.New("transaction ID cannot be empty")
	}

	var tx models.VaultTransaction
	if err := s.db.WithContext(ctx).Where("id = ?", txID).First(&tx).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("transaction not found: %s", txID)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	return &tx, nil
}

func (s *VaultServicesConsolidatedImpl) GetVaultTransactions(ctx context.Context, vaultID string) ([]*models.VaultTransaction, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	var transactions []models.VaultTransaction
	if err := s.db.WithContext(ctx).
		Where("vault_id = ?", vaultID).
		Order("timestamp DESC").
		Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) GetUserTransactions(ctx context.Context, userID string) ([]*models.VaultTransaction, error) {
	if userID == "" {
		return nil, errors.New("user ID cannot be empty")
	}

	var transactions []models.VaultTransaction
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("timestamp DESC").
		Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to get user transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

func (s *VaultServicesConsolidatedImpl) ListTransactions(ctx context.Context, filter *models.VaultTransactionFilter) ([]*models.VaultTransaction, error) {
	var transactions []models.VaultTransaction
	query := s.db.WithContext(ctx)

	if filter != nil {
		if filter.VaultID != nil {
			query = query.Where("vault_id = ?", *filter.VaultID)
		}
		if filter.UserID != nil {
			query = query.Where("user_id = ?", *filter.UserID)
		}
		if filter.Type != nil {
			query = query.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil {
			query = query.Where("status = ?", *filter.Status)
		}
		if filter.StartDate != nil {
			query = query.Where("timestamp >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("timestamp <= ?", *filter.EndDate)
		}
	}

	query = query.Order("timestamp DESC")

	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	if err := query.Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to list transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

// ============================================================================
// Composite Operations (with consistency guarantees)
// ============================================================================

func (s *VaultServicesConsolidatedImpl) ProcessDeposit(ctx context.Context, vaultID, userID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error) {
	if vaultID == "" || userID == "" {
		return nil, nil, errors.New("vault ID and user ID cannot be empty")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	// Create deposit transaction
	depositTx := &models.VaultTransaction{
		VaultID:       vaultID,
		UserID:        &userID,
		Type:          "deposit",
		Status:        "executed",
		AmountUSD:     amountUSD,
		Shares:        amountUSD, // Initial share price is 1:1
		PricePerShare: decimal.NewFromInt(1),
		Asset:         &asset,
		AssetQuantity: quantity,
		AssetPrice:    price,
		CreatedBy:     "system",
	}

	if err := tx.Create(depositTx).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create deposit transaction: %w", err)
	}

	// Create mint_shares transaction
	mintTx := &models.VaultTransaction{
		VaultID:       vaultID,
		UserID:        &userID,
		Type:          "mint_shares",
		Status:        "executed",
		AmountUSD:     amountUSD,
		Shares:        amountUSD,
		PricePerShare: decimal.NewFromInt(1),
		CreatedBy:     "system",
	}

	if err := tx.Create(mintTx).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create mint_shares transaction: %w", err)
	}

	// Get or create vault share record
	var vaultShare models.VaultShare
	if err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&vaultShare).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			tx.Rollback()
			return nil, nil, fmt.Errorf("failed to query vault share: %w", err)
		}

		// Create new vault share
		vaultShare = models.VaultShare{
			ID:        uuid.NewString(),
			VaultID:   vaultID,
			UserID:    userID,
			CreatedAt: time.Now(),
		}

		if err := tx.Create(&vaultShare).Error; err != nil {
			tx.Rollback()
			return nil, nil, fmt.Errorf("failed to create vault share: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return depositTx, &vaultShare, nil
}

func (s *VaultServicesConsolidatedImpl) ProcessWithdrawal(ctx context.Context, vaultID, userID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error) {
	if vaultID == "" || userID == "" {
		return nil, nil, errors.New("vault ID and user ID cannot be empty")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	// Create withdrawal transaction
	withdrawalTx := &models.VaultTransaction{
		VaultID:       vaultID,
		UserID:        &userID,
		Type:          "withdrawal",
		Status:        "executed",
		AmountUSD:     amountUSD,
		Shares:        amountUSD,
		PricePerShare: decimal.NewFromInt(1),
		Asset:         &asset,
		AssetQuantity: quantity,
		AssetPrice:    price,
		CreatedBy:     "system",
	}

	if err := tx.Create(withdrawalTx).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create withdrawal transaction: %w", err)
	}

	// Create burn_shares transaction
	burnTx := &models.VaultTransaction{
		VaultID:       vaultID,
		UserID:        &userID,
		Type:          "burn_shares",
		Status:        "executed",
		AmountUSD:     amountUSD,
		Shares:        amountUSD,
		PricePerShare: decimal.NewFromInt(1),
		CreatedBy:     "system",
	}

	if err := tx.Create(burnTx).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create burn_shares transaction: %w", err)
	}

	// Get vault share record
	var vaultShare models.VaultShare
	if err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&vaultShare).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to get vault share: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return withdrawalTx, &vaultShare, nil
}

func (s *VaultServicesConsolidatedImpl) ProcessYield(ctx context.Context, vaultID string, amountUSD decimal.Decimal, asset string, quantity decimal.Decimal, price decimal.Decimal) (*models.VaultTransaction, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	yieldTx := &models.VaultTransaction{
		VaultID:       vaultID,
		Type:          "yield",
		Status:        "executed",
		AmountUSD:     amountUSD,
		Asset:         &asset,
		AssetQuantity: quantity,
		AssetPrice:    price,
		CreatedBy:     "system",
	}

	if err := s.db.WithContext(ctx).Create(yieldTx).Error; err != nil {
		return nil, fmt.Errorf("failed to create yield transaction: %w", err)
	}

	return yieldTx, nil
}

func (s *VaultServicesConsolidatedImpl) ProcessFee(ctx context.Context, vaultID string, feeAmount decimal.Decimal, feeType string, feeRate decimal.Decimal) (*models.VaultTransaction, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	feeTx := &models.VaultTransaction{
		VaultID:   vaultID,
		Type:      "fee",
		Status:    "executed",
		FeeAmount: feeAmount,
		FeeType:   &feeType,
		FeeRate:   feeRate,
		CreatedBy: "system",
	}

	if err := s.db.WithContext(ctx).Create(feeTx).Error; err != nil {
		return nil, fmt.Errorf("failed to create fee transaction: %w", err)
	}

	return feeTx, nil
}

// ============================================================================
// State Recalculation
// ============================================================================

func (s *VaultServicesConsolidatedImpl) RecalculateVaultState(ctx context.Context, vaultID string) error {
	if vaultID == "" {
		return errors.New("vault ID cannot be empty")
	}

	// Call the database function
	result := s.db.WithContext(ctx).Raw(
		"SELECT recalculate_vault_from_transactions(?)",
		vaultID,
	)

	if result.Error != nil {
		return fmt.Errorf("failed to recalculate vault state: %w", result.Error)
	}

	return nil
}

func (s *VaultServicesConsolidatedImpl) RecalculateUserHoldings(ctx context.Context, vaultID, userID string) error {
	if vaultID == "" || userID == "" {
		return errors.New("vault ID and user ID cannot be empty")
	}

	result := s.db.WithContext(ctx).Raw(
		"SELECT recalculate_user_vault_holdings(?, ?)",
		vaultID, userID,
	)

	if result.Error != nil {
		return fmt.Errorf("failed to recalculate user holdings: %w", result.Error)
	}

	return nil
}

func (s *VaultServicesConsolidatedImpl) RecalculateAssetHoldings(ctx context.Context, vaultID, asset, account string) error {
	if vaultID == "" || asset == "" || account == "" {
		return errors.New("vault ID, asset, and account cannot be empty")
	}

	result := s.db.WithContext(ctx).Raw(
		"SELECT recalculate_vault_asset_holdings(?, ?, ?)",
		vaultID, asset, account,
	)

	if result.Error != nil {
		return fmt.Errorf("failed to recalculate asset holdings: %w", result.Error)
	}

	return nil
}

// ============================================================================
// Reporting
// ============================================================================

func (s *VaultServicesConsolidatedImpl) GetVaultSummary(ctx context.Context, vaultID string) (*models.VaultSummary, error) {
	if vaultID == "" {
		return nil, errors.New("vault ID cannot be empty")
	}

	var summary models.VaultSummary
	if err := s.db.WithContext(ctx).
		Raw(`
			SELECT 
				v.id as vault_id,
				v.name,
				v.total_supply,
				v.total_assets_under_management,
				v.current_share_price,
				COUNT(DISTINCT vs.user_id) as user_count,
				COUNT(DISTINCT vt.id) as transaction_count
			FROM vaults v
			LEFT JOIN vault_shares vs ON v.id = vs.vault_id
			LEFT JOIN vault_transactions vt ON v.id = vt.vault_id
			WHERE v.id = ?
			GROUP BY v.id, v.name, v.total_supply, v.total_assets_under_management, v.current_share_price
		`, vaultID).
		Scan(&summary).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault summary: %w", err)
	}

	return &summary, nil
}

func (s *VaultServicesConsolidatedImpl) GetTransactionSummary(ctx context.Context, filter *models.VaultTransactionFilter) (*models.VaultTransactionSummary, error) {
	var summary models.VaultTransactionSummary
	query := s.db.WithContext(ctx)

	if filter != nil && filter.VaultID != nil {
		query = query.Where("vault_id = ?", *filter.VaultID)
	}

	if err := query.
		Raw(`
			SELECT 
				COUNT(*) as total_transactions,
				SUM(CASE WHEN type IN ('deposit', 'mint_shares') THEN amount_usd ELSE 0 END) as total_deposits,
				SUM(CASE WHEN type IN ('withdrawal', 'burn_shares') THEN amount_usd ELSE 0 END) as total_withdrawals,
				SUM(CASE WHEN type = 'fee' THEN fee_amount ELSE 0 END) as total_fees,
				SUM(CASE WHEN type = 'yield' THEN amount_usd ELSE 0 END) as total_yield
			FROM vault_transactions
		`).
		Scan(&summary).Error; err != nil {
		return nil, fmt.Errorf("failed to get transaction summary: %w", err)
	}

	return &summary, nil
}

// ============================================================================
// Helper Functions
// ============================================================================
