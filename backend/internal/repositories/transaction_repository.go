package repositories

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"gorm.io/gorm"
)

type transactionRepository struct {
	db *db.DB
}

// NewTransactionRepository creates a new transaction repository
func NewTransactionRepository(database *db.DB) TransactionRepository {
	return &transactionRepository{db: database}
}

func (r *transactionRepository) Create(ctx context.Context, tx *models.Transaction) error {
	if err := r.db.WithContext(ctx).Create(tx).Error; err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}
	return nil
}

func (r *transactionRepository) CreateBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error) {
	if len(txs) == 0 {
		return nil, nil
	}

	// Start GORM transaction
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, t := range txs {
			if t == nil {
				return fmt.Errorf("nil transaction in batch")
			}
			if err := tx.Create(t).Error; err != nil {
				return fmt.Errorf("failed to create transaction: %w", err)
			}
		}

		// Handle transaction links if needed (keeping raw SQL for this custom table)
		if linkType != "" && len(txs) > 1 {
			rootID := txs[0].ID
			for i := 1; i < len(txs); i++ {
				if err := tx.Exec("INSERT INTO transaction_links (link_type, from_tx, to_tx) VALUES (?, ?, ?)",
					linkType, rootID, txs[i].ID).Error; err != nil {
					return fmt.Errorf("failed to insert link: %w", err)
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create batch: %w", err)
	}

	return txs, nil
}

func (r *transactionRepository) GetByID(ctx context.Context, id string) (*models.Transaction, error) {
	if id == "" {
		return nil, fmt.Errorf("transaction not found: %s", id)
	}

	var tx models.Transaction
	if err := r.db.WithContext(ctx).First(&tx, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	return &tx, nil
}

func (r *transactionRepository) List(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error) {
	query := r.db.WithContext(ctx)

	// Apply filters
	if filter != nil {
		if filter.InvestmentID != nil && *filter.InvestmentID != "" {
			if _, err := uuid.Parse(*filter.InvestmentID); err != nil {
				return []*models.Transaction{}, nil
			}
			query = query.Where("investment_id = ?", *filter.InvestmentID)
		}
		if filter.StartDate != nil {
			query = query.Where("date >= ?", *filter.StartDate)
		}

		if filter.EndDate != nil {
			query = query.Where("date <= ?", *filter.EndDate)
		}

		if len(filter.Types) > 0 {
			query = query.Where("type IN ?", filter.Types)
		}

		if len(filter.Assets) > 0 {
			query = query.Where("asset IN ?", filter.Assets)
		}

		if len(filter.Accounts) > 0 {
			query = query.Where("account IN ?", filter.Accounts)
		}

		if len(filter.Tags) > 0 {
			query = query.Where("tag IN ?", filter.Tags)
		}

		if filter.Counterparty != nil {
			query = query.Where("counterparty = ?", *filter.Counterparty)
		}
	}

	// Order by date descending, then created_at descending
	query = query.Order("date DESC, created_at DESC")

	// Apply pagination
	if filter != nil && filter.Limit > 0 {
		query = query.Limit(filter.Limit)
		if filter.Offset > 0 {
			query = query.Offset(filter.Offset)
		}
	}

	var transactions []*models.Transaction
	if err := query.Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to list transactions: %w", err)
	}

	return transactions, nil
}

func (r *transactionRepository) GetCount(ctx context.Context, filter *models.TransactionFilter) (int, error) {
	query := r.db.WithContext(ctx).Model(&models.Transaction{})

	// Apply filters (same as List method)
	if filter != nil {
		if filter.InvestmentID != nil && *filter.InvestmentID != "" {
			query = query.Where("investment_id = ?", *filter.InvestmentID)
		}
		if filter.StartDate != nil {
			query = query.Where("date >= ?", *filter.StartDate)
		}

		if filter.EndDate != nil {
			query = query.Where("date <= ?", *filter.EndDate)
		}

		if len(filter.Types) > 0 {
			query = query.Where("type IN ?", filter.Types)
		}

		if len(filter.Assets) > 0 {
			query = query.Where("asset IN ?", filter.Assets)
		}

		if len(filter.Accounts) > 0 {
			query = query.Where("account IN ?", filter.Accounts)
		}

		if len(filter.Tags) > 0 {
			query = query.Where("tag IN ?", filter.Tags)
		}

		if filter.Counterparty != nil {
			query = query.Where("counterparty = ?", *filter.Counterparty)
		}
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to get transaction count: %w", err)
	}

	return int(count), nil
}

func (r *transactionRepository) Update(ctx context.Context, tx *models.Transaction) error {
	if tx == nil || tx.ID == "" {
		return fmt.Errorf("no transaction found with id %s", "")
	}

	result := r.db.WithContext(ctx).Model(&models.Transaction{}).Where("id = ?", tx.ID).Updates(tx)
	if result.Error != nil {
		return fmt.Errorf("failed to update transaction: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("no transaction found with id %s", tx.ID)
	}

	return nil
}

func (r *transactionRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Check for stake_unstake links and clear exit_date if found
		var linkedDepositID string
		if err := tx.Raw("SELECT from_tx FROM transaction_links WHERE link_type = 'stake_unstake' AND to_tx = ?", id).Scan(&linkedDepositID).Error; err != nil {
			// If there's an error other than "no rows", return it
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("failed to check for linked transactions: %w", err)
			}
		} else if linkedDepositID != "" {
			// Clear exit_date for linked deposit
			if err := tx.Exec("UPDATE transactions SET exit_date = NULL WHERE id = ?", linkedDepositID).Error; err != nil {
				return fmt.Errorf("failed to clear exit_date: %w", err)
			}
		}

		// Delete the transaction
		result := tx.Where("id = ?", id).Delete(&models.Transaction{})
		if result.Error != nil {
			return fmt.Errorf("failed to delete transaction: %w", result.Error)
		}

		if result.RowsAffected == 0 {
			return fmt.Errorf("transaction not found: %s", id)
		}

		return nil
	})
}

// DeleteMany deletes multiple transactions by IDs, handling related links and stake/unstake reversals where needed
func (r *transactionRepository) DeleteMany(ctx context.Context, ids []string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}

	var affected int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Clear exit_date for any deposits that were linked to an unstake being deleted
		// For each id in ids, if it's a to_tx in stake_unstake, clear exit_date of its from_tx
		// Use a single UPDATE with subquery
		if err := tx.Exec(`
            UPDATE transactions SET exit_date = NULL
            WHERE id IN (
                SELECT from_tx FROM transaction_links
                WHERE link_type = 'stake_unstake' AND to_tx IN ?
            )
        `, ids).Error; err != nil {
			return fmt.Errorf("failed to clear exit_date for linked deposits: %w", err)
		}

		// Delete action links referencing any of these IDs to avoid FK issues
		// Use two separate queries to avoid parameter binding issues
		if err := tx.Exec("DELETE FROM transaction_links WHERE from_tx IN ?", ids).Error; err != nil {
			return fmt.Errorf("failed to delete links for transactions (from_tx): %w", err)
		}
		if err := tx.Exec("DELETE FROM transaction_links WHERE to_tx IN ?", ids).Error; err != nil {
			return fmt.Errorf("failed to delete links for transactions (to_tx): %w", err)
		}

		// Delete transactions
		result := tx.Where("id IN ?", ids).Delete(&models.Transaction{})
		if result.Error != nil {
			return fmt.Errorf("failed to delete transactions: %w", result.Error)
		}
		affected = result.RowsAffected
		return nil
	})
	if err != nil {
		return 0, err
	}
	return int(affected), nil
}

func (r *transactionRepository) DeleteActionGroup(ctx context.Context, oneID string) (int, error) {
	if oneID == "" {
		return 0, fmt.Errorf("id is required")
	}

	// Use GORM transaction
	var affected int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// For complex SQL queries, use underlying SQL DB within transaction
		sqlTx, err := tx.DB()
		if err != nil {
			return fmt.Errorf("failed to get SQL tx: %w", err)
		}

		queryIDs := `
			WITH group_links AS (
				SELECT from_tx, to_tx
				FROM transaction_links
				WHERE link_type = 'action' AND (from_tx = $1 OR to_tx = $1)
			), roots AS (
				SELECT DISTINCT from_tx AS root FROM group_links
			), members AS (
				SELECT root FROM roots
				UNION
				SELECT to_tx AS root FROM group_links
			)
			SELECT DISTINCT id FROM (
				SELECT $1::uuid AS id
				UNION
				SELECT root AS id FROM members
			) s`

		rows, err := sqlTx.QueryContext(ctx, queryIDs, oneID)
		if err != nil {
			return fmt.Errorf("failed to query group ids: %w", err)
		}
		defer rows.Close()

		ids := make([]string, 0, 8)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return fmt.Errorf("failed to scan id: %w", err)
			}
			ids = append(ids, id)
		}

		if len(ids) == 0 {
			result := tx.Where("id = ?", oneID).Delete(&models.Transaction{})
			affected = result.RowsAffected
			return result.Error
		}

		// Delete transaction links first
		if err := tx.Where("link_type = ? AND (from_tx IN ? OR to_tx IN ?)", "action", ids, ids).Delete(&struct{}{}).Error; err != nil {
			return fmt.Errorf("failed to delete action links: %w", err)
		}

		// Delete transactions
		result := tx.Where("id IN ?", ids).Delete(&models.Transaction{})
		affected = result.RowsAffected
		return result.Error
	})
	if err != nil {
		return 0, fmt.Errorf("failed to delete action group: %w", err)
	}

	return int(affected), nil
}

func (r *transactionRepository) RecalculateFX(ctx context.Context, onlyMissing bool) (int, error) {
	query := r.db.WithContext(ctx).Model(&models.Transaction{})

	if onlyMissing {
		query = query.Where("fx_to_usd = 0 OR fx_to_vnd = 0")
	}

	var transactions []models.Transaction
	if err := query.Find(&transactions).Error; err != nil {
		return 0, fmt.Errorf("failed to list transactions for FX recalc: %w", err)
	}

	updated := 0
	for _, tx := range transactions {
		// Recalculate derived fields
		tx.CalculateDerivedFields()
		tx.UpdatedAt = time.Now()

		// Update with recalculated values
		result := r.db.WithContext(ctx).Model(&models.Transaction{}).Where("id = ?", tx.ID).Updates(map[string]interface{}{
			"amount_local": tx.AmountLocal,
			"amount_usd":   tx.AmountUSD,
			"amount_vnd":   tx.AmountVND,
			"delta_qty":    tx.DeltaQty,
			"cashflow_usd": tx.CashFlowUSD,
			"cashflow_vnd": tx.CashFlowVND,
			"updated_at":   tx.UpdatedAt,
		})

		if result.Error == nil {
			updated++
		}
	}

	return updated, nil
}

func (r *transactionRepository) RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error) {
	var tx models.Transaction
	if err := r.db.WithContext(ctx).First(&tx, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	// Recalculate derived fields
	tx.CalculateDerivedFields()
	tx.UpdatedAt = time.Now()

	// Update with recalculated values
	if err := r.db.WithContext(ctx).Model(&models.Transaction{}).Where("id = ?", id).Updates(map[string]interface{}{
		"amount_local": tx.AmountLocal,
		"amount_usd":   tx.AmountUSD,
		"amount_vnd":   tx.AmountVND,
		"delta_qty":    tx.DeltaQty,
		"cashflow_usd": tx.CashFlowUSD,
		"cashflow_vnd": tx.CashFlowVND,
		"updated_at":   tx.UpdatedAt,
	}).Error; err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	return &tx, nil
}
