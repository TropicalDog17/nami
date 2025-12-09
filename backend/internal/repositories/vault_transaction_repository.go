package repositories

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"gorm.io/gorm"
)

type vaultTransactionRepository struct {
	db *db.DB
}

// NewVaultTransactionRepository creates a new vault transaction repository
func NewVaultTransactionRepository(database *db.DB) VaultTransactionRepository {
	return &vaultTransactionRepository{db: database}
}

// VaultHoldings represents current vault holdings derived from transactions
type VaultHoldings struct {
	VaultID             string
	TotalShares         decimal.Decimal
	TotalAUM            decimal.Decimal
	SharePrice          decimal.Decimal
	TransactionCount    int
	LastTransactionID   string
	LastTransactionTime time.Time
}

// UserVaultHoldings represents user-specific vault holdings
type UserVaultHoldings struct {
	VaultID           string
	UserID            string
	ShareBalance      decimal.Decimal
	NetDeposits       decimal.Decimal
	TotalFeesPaid     decimal.Decimal
	TransactionCount  int
	LastTransactionID string
	LastActivityDate  time.Time
}

// VaultAssetHoldings represents asset-specific holdings within a vault
type VaultAssetHoldings struct {
	VaultID             string
	Asset               string
	Account             string
	TotalQuantity       decimal.Decimal
	TotalValue          decimal.Decimal
	TransactionCount    int
	LastTransactionID   string
	LastTransactionTime time.Time
}

func (r *vaultTransactionRepository) Create(ctx context.Context, vt *models.VaultTransaction) error {
	if err := vt.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	if err := r.db.WithContext(ctx).Create(vt).Error; err != nil {
		return fmt.Errorf("failed to create vault transaction: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) CreateBatch(ctx context.Context, vts []*models.VaultTransaction) error {
	if len(vts) == 0 {
		return nil
	}

	// Validate all transactions
	for _, vt := range vts {
		if err := vt.Validate(); err != nil {
			return fmt.Errorf("validation failed: %w", err)
		}
	}

	// Create all transactions in a single database transaction
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, vt := range vts {
			if err := tx.Create(vt).Error; err != nil {
				return fmt.Errorf("failed to create vault transaction: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to create batch: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) GetByID(ctx context.Context, id string) (*models.VaultTransaction, error) {
	if id == "" {
		return nil, fmt.Errorf("vault transaction ID is required")
	}

	var vt models.VaultTransaction
	if err := r.db.WithContext(ctx).First(&vt, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("vault transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get vault transaction: %w", err)
	}

	return &vt, nil
}

func (r *vaultTransactionRepository) List(ctx context.Context, filter *models.VaultTransactionFilter) ([]*models.VaultTransaction, error) {
	query := r.db.WithContext(ctx)

	// Apply filters
	if filter != nil {
		if filter.VaultID != nil && *filter.VaultID != "" {
			query = query.Where("vault_id = ?", *filter.VaultID)
		}
		if filter.UserID != nil && *filter.UserID != "" {
			query = query.Where("user_id = ?", *filter.UserID)
		}
		if filter.Type != nil {
			query = query.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil && *filter.Status != "" {
			query = query.Where("status = ?", *filter.Status)
		}
		if filter.Asset != nil && *filter.Asset != "" {
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
		if filter.TransactionHash != nil && *filter.TransactionHash != "" {
			query = query.Where("transaction_hash = ?", *filter.TransactionHash)
		}
		if filter.ExternalTxID != nil && *filter.ExternalTxID != "" {
			query = query.Where("external_tx_id = ?", *filter.ExternalTxID)
		}
	}

	// Order by timestamp descending
	query = query.Order("timestamp DESC, created_at DESC")

	// Apply pagination
	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	var transactions []*models.VaultTransaction
	if err := query.Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to list vault transactions: %w", err)
	}

	return transactions, nil
}

func (r *vaultTransactionRepository) GetCount(ctx context.Context, filter *models.VaultTransactionFilter) (int, error) {
	query := r.db.WithContext(ctx).Model(&models.VaultTransaction{})

	// Apply filters (same as List)
	if filter != nil {
		if filter.VaultID != nil && *filter.VaultID != "" {
			query = query.Where("vault_id = ?", *filter.VaultID)
		}
		if filter.UserID != nil && *filter.UserID != "" {
			query = query.Where("user_id = ?", *filter.UserID)
		}
		if filter.Type != nil {
			query = query.Where("type = ?", *filter.Type)
		}
		if filter.Status != nil && *filter.Status != "" {
			query = query.Where("status = ?", *filter.Status)
		}
		if filter.Asset != nil && *filter.Asset != "" {
			query = query.Where("asset = ?", *filter.Asset)
		}
		if filter.MinAmount != nil {
			query = query.Where("amount_usd >= ?", *filter.MinAmount)
		}
		if filter.MaxAmount != nil {
			query = query.Where("amount_usd <= ?", *filter.MaxAmount)
		}
		if filter.StartDate != nil {
			query = query.Where("timestamp >= ?", *filter.StartDate)
		}
		if filter.EndDate != nil {
			query = query.Where("timestamp <= ?", *filter.EndDate)
		}
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count vault transactions: %w", err)
	}

	return int(count), nil
}

func (r *vaultTransactionRepository) Update(ctx context.Context, vt *models.VaultTransaction) error {
	if err := vt.Validate(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	if err := r.db.WithContext(ctx).Save(vt).Error; err != nil {
		return fmt.Errorf("failed to update vault transaction: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) Delete(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("vault transaction ID is required")
	}

	if err := r.db.WithContext(ctx).Delete(&models.VaultTransaction{}, "id = ?", id).Error; err != nil {
		return fmt.Errorf("failed to delete vault transaction: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) GetVaultHoldings(ctx context.Context, vaultID string) (*VaultHoldings, error) {
	if vaultID == "" {
		return nil, fmt.Errorf("vault ID is required")
	}

	var holdings VaultHoldings
	query := `
		SELECT 
			? as vault_id,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'mint_shares', 'yield', 'income') THEN shares
				WHEN type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -shares
				ELSE 0
			END), 0) as total_shares,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'mint_shares', 'yield', 'income') THEN amount_usd
				WHEN type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -amount_usd
				ELSE 0
			END), 0) as total_aum,
			COUNT(*) as transaction_count,
			MAX(id) as last_transaction_id,
			MAX(timestamp) as last_transaction_time
		FROM vault_transactions
		WHERE vault_id = ? AND is_reversal = FALSE
	`

	if err := r.db.WithContext(ctx).Raw(query, vaultID, vaultID).Scan(&holdings).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault holdings: %w", err)
	}

	// Calculate share price
	if holdings.TotalShares.IsPositive() {
		holdings.SharePrice = holdings.TotalAUM.Div(holdings.TotalShares)
	} else {
		holdings.SharePrice = decimal.NewFromInt(1)
	}

	return &holdings, nil
}

func (r *vaultTransactionRepository) GetUserVaultHoldings(ctx context.Context, vaultID, userID string) (*UserVaultHoldings, error) {
	if vaultID == "" || userID == "" {
		return nil, fmt.Errorf("vault ID and user ID are required")
	}

	var holdings UserVaultHoldings
	query := `
		SELECT 
			? as vault_id,
			? as user_id,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'mint_shares', 'yield', 'income') THEN shares
				WHEN type IN ('withdrawal', 'burn_shares', 'fee', 'expense') THEN -shares
				ELSE 0
			END), 0) as share_balance,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'mint_shares') THEN amount_usd
				WHEN type IN ('withdrawal', 'burn_shares') THEN -amount_usd
				ELSE 0
			END), 0) as net_deposits,
			COALESCE(SUM(CASE 
				WHEN type = 'fee' THEN fee_amount
				ELSE 0
			END), 0) as total_fees_paid,
			COUNT(*) as transaction_count,
			MAX(id) as last_transaction_id,
			MAX(timestamp) as last_activity_date
		FROM vault_transactions
		WHERE vault_id = ? AND user_id = ? AND is_reversal = FALSE
	`

	if err := r.db.WithContext(ctx).Raw(query, vaultID, userID, vaultID, userID).Scan(&holdings).Error; err != nil {
		return nil, fmt.Errorf("failed to get user vault holdings: %w", err)
	}

	return &holdings, nil
}

func (r *vaultTransactionRepository) GetVaultAssetHoldings(ctx context.Context, vaultID, asset, account string) (*VaultAssetHoldings, error) {
	if vaultID == "" || asset == "" || account == "" {
		return nil, fmt.Errorf("vault ID, asset, and account are required")
	}

	var holdings VaultAssetHoldings
	query := `
		SELECT 
			? as vault_id,
			? as asset,
			? as account,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'income', 'yield') THEN asset_quantity
				WHEN type IN ('withdrawal', 'expense', 'fee') THEN -asset_quantity
				ELSE 0
			END), 0) as total_quantity,
			COALESCE(SUM(CASE 
				WHEN type IN ('deposit', 'income', 'yield') THEN asset_quantity * asset_price
				WHEN type IN ('withdrawal', 'expense', 'fee') THEN -(asset_quantity * asset_price)
				ELSE 0
			END), 0) as total_value,
			COUNT(*) as transaction_count,
			MAX(id) as last_transaction_id,
			MAX(timestamp) as last_transaction_time
		FROM vault_transactions
		WHERE vault_id = ? AND asset = ? AND account = ? AND is_reversal = FALSE
	`

	if err := r.db.WithContext(ctx).Raw(query, vaultID, asset, account, vaultID, asset, account).Scan(&holdings).Error; err != nil {
		return nil, fmt.Errorf("failed to get vault asset holdings: %w", err)
	}

	return &holdings, nil
}

func (r *vaultTransactionRepository) RecalculateVaultState(ctx context.Context, vaultID string) error {
	if vaultID == "" {
		return fmt.Errorf("vault ID is required")
	}

	if err := r.db.WithContext(ctx).Exec("SELECT recalculate_vault_from_transactions(?)", vaultID).Error; err != nil {
		return fmt.Errorf("failed to recalculate vault state: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) RecalculateUserHoldings(ctx context.Context, vaultID, userID string) error {
	if vaultID == "" || userID == "" {
		return fmt.Errorf("vault ID and user ID are required")
	}

	if err := r.db.WithContext(ctx).Exec("SELECT recalculate_user_vault_holdings(?, ?)", vaultID, userID).Error; err != nil {
		return fmt.Errorf("failed to recalculate user holdings: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) RecalculateAssetHoldings(ctx context.Context, vaultID, asset, account string) error {
	if vaultID == "" || asset == "" || account == "" {
		return fmt.Errorf("vault ID, asset, and account are required")
	}

	if err := r.db.WithContext(ctx).Exec("SELECT recalculate_vault_asset_holdings(?, ?, ?)", vaultID, asset, account).Error; err != nil {
		return fmt.Errorf("failed to recalculate asset holdings: %w", err)
	}

	return nil
}

func (r *vaultTransactionRepository) GetTransactionHistory(ctx context.Context, vaultID string, limit, offset int) ([]*models.VaultTransaction, error) {
	if vaultID == "" {
		return nil, fmt.Errorf("vault ID is required")
	}

	filter := &models.VaultTransactionFilter{
		VaultID: &vaultID,
		Limit:   limit,
		Offset:  offset,
	}

	return r.List(ctx, filter)
}

func (r *vaultTransactionRepository) GetUserTransactionHistory(ctx context.Context, vaultID, userID string, limit, offset int) ([]*models.VaultTransaction, error) {
	if vaultID == "" || userID == "" {
		return nil, fmt.Errorf("vault ID and user ID are required")
	}

	filter := &models.VaultTransactionFilter{
		VaultID: &vaultID,
		UserID:  &userID,
		Limit:   limit,
		Offset:  offset,
	}

	return r.List(ctx, filter)
}
