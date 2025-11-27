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

// VaultTransactionServiceImpl implements VaultTransactionService
type VaultTransactionServiceImpl struct {
	db *gorm.DB
}

// NewVaultTransactionService creates a new vault transaction service
func NewVaultTransactionService(db *gorm.DB) VaultTransactionService {
	return &VaultTransactionServiceImpl{db: db}
}

// CreateTransaction creates a new vault transaction
func (s *VaultTransactionServiceImpl) CreateTransaction(ctx context.Context, tx *models.VaultTransaction) (*models.VaultTransaction, error) {
	if err := tx.Validate(); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	if tx.ID == "" {
		tx.ID = generateUUID()
	}

	tx.Timestamp = time.Now()
	tx.CreatedAt = time.Now()
	tx.UpdatedAt = time.Now()

	if err := s.db.WithContext(ctx).Create(tx).Error; err != nil {
		return nil, fmt.Errorf("failed to create vault transaction: %w", err)
	}

	return tx, nil
}

// GetTransactionByID retrieves a transaction by ID
func (s *VaultTransactionServiceImpl) GetTransactionByID(ctx context.Context, id string) (*models.VaultTransaction, error) {
	var transaction models.VaultTransaction
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&transaction).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}
	return &transaction, nil
}

// GetTransactions retrieves transactions based on filter
func (s *VaultTransactionServiceImpl) GetTransactions(ctx context.Context, filter *models.VaultTransactionFilter) ([]*models.VaultTransaction, error) {
	var transactions []models.VaultTransaction
	query := s.db.WithContext(ctx).Model(&models.VaultTransaction{})

	// Apply filters
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
		if filter.Asset != nil {
			query = query.Where("asset = ?", *filter.Asset)
		}
		if filter.MinAmount != nil {
			query = query.Where("amount_usd >= ?", *filter.MinAmount)
		}
		if filter.MaxAmount != nil {
			query = query.Where("amount_usd <= ?", *filter.MaxAmount)
		}
		if filter.MinShares != nil {
			query = query.Where("shares >= ?", *filter.MinShares)
		}
		if filter.MaxShares != nil {
			query = query.Where("shares <= ?", *filter.MaxShares)
		}
		if filter.StartDate != nil {
			query = query.Where("timestamp >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("timestamp <= ?", *filter.EndDate)
		}
		if filter.TransactionHash != nil {
			query = query.Where("transaction_hash = ?", *filter.TransactionHash)
		}
		if filter.ExternalTxID != nil {
			query = query.Where("external_tx_id = ?", *filter.ExternalTxID)
		}
	}

	query = query.Order("timestamp DESC")

	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	err := query.Find(&transactions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

// UpdateTransaction updates an existing transaction
func (s *VaultTransactionServiceImpl) UpdateTransaction(ctx context.Context, tx *models.VaultTransaction) error {
	if err := tx.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	tx.UpdatedAt = time.Now()

	result := s.db.WithContext(ctx).Save(tx)
	if result.Error != nil {
		return fmt.Errorf("failed to update transaction: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("transaction not found: %s", tx.ID)
	}

	return nil
}

// DeleteTransaction deletes a transaction
func (s *VaultTransactionServiceImpl) DeleteTransaction(ctx context.Context, id string) error {
	result := s.db.WithContext(ctx).Delete(&models.VaultTransaction{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete transaction: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("transaction not found: %s", id)
	}

	return nil
}

// GetVaultTransactions retrieves all transactions for a specific vault
func (s *VaultTransactionServiceImpl) GetVaultTransactions(ctx context.Context, vaultID string) ([]*models.VaultTransaction, error) {
	var transactions []models.VaultTransaction
	err := s.db.WithContext(ctx).Where("vault_id = ?", vaultID).Order("timestamp DESC").Find(&transactions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get vault transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

// GetUserTransactions retrieves all transactions for a specific user
func (s *VaultTransactionServiceImpl) GetUserTransactions(ctx context.Context, userID string) ([]*models.VaultTransaction, error) {
	var transactions []models.VaultTransaction
	err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("timestamp DESC").Find(&transactions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user transactions: %w", err)
	}

	result := make([]*models.VaultTransaction, len(transactions))
	for i := range transactions {
		result[i] = &transactions[i]
	}

	return result, nil
}

// GetTransactionSummary retrieves transaction summary statistics
func (s *VaultTransactionServiceImpl) GetTransactionSummary(ctx context.Context, filter *models.VaultTransactionFilter) (*models.VaultTransactionSummary, error) {
	var summary models.VaultTransactionSummary

	query := s.db.WithContext(ctx).Model(&models.VaultTransaction{})

	// Apply filters for summary
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
	}

	// Count total transactions
	var totalCount int64
	query.Count(&totalCount)
	summary.TotalTransactions = int(totalCount)

	// Calculate totals
	var result struct {
		TotalDeposits      decimal.Decimal `json:"total_deposits"`
		TotalWithdrawals   decimal.Decimal `json:"total_withdrawals"`
		TotalSharesMinted  decimal.Decimal `json:"total_shares_minted"`
		TotalSharesBurned  decimal.Decimal `json:"total_shares_burned"`
		TotalFeesCollected decimal.Decimal `json:"total_fees_collected"`
	}

	summaryQuery := s.db.WithContext(ctx).Model(&models.VaultTransaction{}).Select(
		"COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount_usd ELSE 0 END), 0) as total_deposits, " +
			"COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount_usd ELSE 0 END), 0) as total_withdrawals, " +
			"COALESCE(SUM(CASE WHEN type = 'mint_shares' THEN shares ELSE 0 END), 0) as total_shares_minted, " +
			"COALESCE(SUM(CASE WHEN type = 'burn_shares' THEN shares ELSE 0 END), 0) as total_shares_burned, " +
			"COALESCE(SUM(fee_amount), 0) as total_fees_collected",
	)

	if filter != nil {
		if filter.VaultID != nil {
			summaryQuery = summaryQuery.Where("vault_id = ?", *filter.VaultID)
		}
		if filter.UserID != nil {
			summaryQuery = summaryQuery.Where("user_id = ?", *filter.UserID)
		}
	}

	err := summaryQuery.Scan(&result).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get summary stats: %w", err)
	}

	summary.TotalDeposits = result.TotalDeposits
	summary.TotalWithdrawals = result.TotalWithdrawals
	summary.TotalSharesMinted = result.TotalSharesMinted
	summary.TotalSharesBurned = result.TotalSharesBurned
	summary.TotalFeesCollected = result.TotalFeesCollected

	// Calculate net flow and averages
	summary.NetDepositFlow = summary.TotalDeposits.Sub(summary.TotalWithdrawals)

	if summary.TotalTransactions > 0 {
		summary.AverageDepositSize = summary.TotalDeposits.Div(decimal.NewFromInt(int64(summary.TotalTransactions)))
		summary.AverageWithdrawalSize = summary.TotalWithdrawals.Div(decimal.NewFromInt(int64(summary.TotalTransactions)))
	}

	return &summary, nil
}

// ProcessDeposit processes a deposit transaction
func (s *VaultTransactionServiceImpl) ProcessDeposit(ctx context.Context, vaultID, userID string, amount decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error) {
	if amount.IsZero() || amount.IsNegative() {
		return nil, nil, errors.New("deposit amount must be positive")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Get vault to determine current share price
	vault := &models.Vault{}
	if err := tx.Where("id = ?", vaultID).First(vault).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to get vault: %w", err)
	}

	if vault.CurrentSharePrice.IsZero() {
		tx.Rollback()
		return nil, nil, errors.New("vault has zero share price, cannot process deposit")
	}

	// Calculate shares to mint
	shares := amount.Div(vault.CurrentSharePrice)

	// Create transaction record
	now := time.Now()
	transaction := &models.VaultTransaction{
		ID:               fmt.Sprintf("vtx_%d", now.UnixNano()),
		VaultID:          vaultID,
		UserID:           &userID,
		Type:             models.VaultTxTypeDeposit,
		AmountUSD:        amount,
		Shares:           shares,
		PricePerShare:    vault.CurrentSharePrice,
		SharePriceBefore: vault.CurrentSharePrice,
		SharePriceAfter:  vault.CurrentSharePrice,
		Status:           "executed",
		VaultAUMBefore:   vault.TotalAssetsUnderManagement,
		UserSharesBefore: decimal.Zero,
		CreatedBy:        userID,
		Timestamp:        now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := tx.Create(transaction).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Update AUM after
	vault.TotalAssetsUnderManagement = vault.TotalAssetsUnderManagement.Add(amount)
	vault.TotalSupply = vault.TotalSupply.Add(shares)

	// Update timestamps and snapshots
	transaction.VaultAUMAfter = vault.TotalAssetsUnderManagement
	transaction.UserSharesAfter = shares
	transaction.ExecutedAt = &[]time.Time{time.Now()}[0]

	if err := tx.Save(vault).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to update vault: %w", err)
	}

	if err := tx.Save(transaction).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	// Get or create vault share record
	vaultShare, err := createOrUpdateVaultShare(tx, vaultID, userID)
	if err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to update vault share: %w", err)
	}

	// Mint shares
	if err := vaultShare.MintShares(shares, vault.CurrentSharePrice); err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to mint shares: %w", err)
	}

	if err := tx.Save(vaultShare).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to save vault share: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return transaction, vaultShare, nil
}

// ProcessWithdrawal processes a withdrawal transaction
func (s *VaultTransactionServiceImpl) ProcessWithdrawal(ctx context.Context, vaultID, userID string, amount decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error) {
	if amount.IsZero() || amount.IsNegative() {
		return nil, nil, errors.New("withdrawal amount must be positive")
	}

	// Start transaction
	tx := s.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Get vault
	vault := &models.Vault{}
	if err := tx.Where("id = ?", vaultID).First(vault).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to get vault: %w", err)
	}

	if vault.CurrentSharePrice.IsZero() {
		tx.Rollback()
		return nil, nil, errors.New("vault has zero share price, cannot process withdrawal")
	}

	// Calculate shares to burn
	shares := amount.Div(vault.CurrentSharePrice)

	// Get vault share record
	vaultShare, err := createOrUpdateVaultShare(tx, vaultID, userID)
	if err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to get vault share: %w", err)
	}

	// Check if user has enough shares
	if vaultShare.ShareBalance.LessThan(shares) {
		tx.Rollback()
		return nil, nil, fmt.Errorf("insufficient shares: have %s, need %s", vaultShare.ShareBalance.String(), shares.String())
	}

	// Create transaction record
	now := time.Now()
	transaction := &models.VaultTransaction{
		ID:               fmt.Sprintf("vtx_%d", now.UnixNano()),
		VaultID:          vaultID,
		UserID:           &userID,
		Type:             models.VaultTxTypeWithdrawal,
		AmountUSD:        amount,
		Shares:           shares,
		PricePerShare:    vault.CurrentSharePrice,
		SharePriceBefore: vault.CurrentSharePrice,
		SharePriceAfter:  vault.CurrentSharePrice,
		Status:           "executed",
		VaultAUMBefore:   vault.TotalAssetsUnderManagement,
		UserSharesBefore: vaultShare.ShareBalance,
		CreatedBy:        userID,
		Timestamp:        now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := tx.Create(transaction).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Burn shares
	if err := vaultShare.BurnShares(shares, vault.CurrentSharePrice); err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to burn shares: %w", err)
	}

	// Save share record
	if err := tx.Save(vaultShare).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to save vault share: %w", err)
	}

	// Update vault
	vault.TotalAssetsUnderManagement = vault.TotalAssetsUnderManagement.Sub(amount)
	vault.TotalSupply = vault.TotalSupply.Sub(shares)
	vault.LastUpdated = time.Now()

	// Update transaction snapshots
	transaction.VaultAUMAfter = vault.TotalAssetsUnderManagement
	transaction.UserSharesAfter = vaultShare.ShareBalance
	transaction.ExecutedAt = &[]time.Time{time.Now()}[0]

	if err := tx.Save(vault).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to update vault: %w", err)
	}

	if err := tx.Save(transaction).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return transaction, vaultShare, nil
}

// Helper function to create or update vault share record
func createOrUpdateVaultShare(tx *gorm.DB, vaultID, userID string) (*models.VaultShare, error) {
	var vaultShare models.VaultShare
	err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&vaultShare).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Create new share record
			vaultShare = models.VaultShare{
				ID:           generateUUID(),
				VaultID:      vaultID,
				UserID:       userID,
				ShareBalance: decimal.Zero,
				CostBasis:    decimal.Zero,
				CreatedAt:    time.Now(),
			}
			if err := tx.Create(&vaultShare).Error; err != nil {
				return nil, fmt.Errorf("failed to create vault share: %w", err)
			}
		} else {
			return nil, fmt.Errorf("failed to check vault share: %w", err)
		}
	}

	return &vaultShare, nil
}
