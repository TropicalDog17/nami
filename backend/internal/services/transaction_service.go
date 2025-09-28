package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// transactionService implements the TransactionService interface
type transactionService struct {
	db         *db.DB
	fxProvider FXProvider
}

// NewTransactionService creates a new transaction service
func NewTransactionService(database *db.DB) TransactionService {
	return &transactionService{
		db:         database,
		fxProvider: nil, // No FX provider
	}
}

// NewTransactionServiceWithFX creates a new transaction service with FX provider
func NewTransactionServiceWithFX(database *db.DB, fxProvider FXProvider) TransactionService {
	return &transactionService{
		db:         database,
		fxProvider: fxProvider,
	}
}

// CreateTransaction creates a new transaction
func (s *transactionService) CreateTransaction(ctx context.Context, tx *models.Transaction) error {
	// Auto-populate FX rates if not provided and FX provider is available
	if err := s.populateFXRates(ctx, tx); err != nil {
		return fmt.Errorf("failed to populate FX rates: %w", err)
	}

	// Prepare transaction for saving (calculate derived fields and validate)
	if err := tx.PreSave(); err != nil {
		return fmt.Errorf("transaction validation failed: %w", err)
	}

	// Set timestamps
	now := time.Now()
	tx.CreatedAt = now
	tx.UpdatedAt = now

	query := `
		INSERT INTO transactions (
			id, date, type, asset, account, counterparty, tag, note,
			quantity, price_local, amount_local,
			fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			fee_usd, fee_vnd,
			delta_qty, cashflow_usd, cashflow_vnd,
			horizon, entry_date, exit_date, fx_impact,
			fx_source, fx_timestamp, created_at, updated_at
		) VALUES (
			uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10,
			$11, $12, $13, $14,
			$15, $16,
			$17, $18, $19,
			$20, $21, $22, $23,
			$24, $25, $26, $27
		) RETURNING id`

	err := s.db.QueryRowContext(ctx, query,
		tx.Date, tx.Type, tx.Asset, tx.Account, tx.Counterparty, tx.Tag, tx.Note,
		tx.Quantity, tx.PriceLocal, tx.AmountLocal,
		tx.FXToUSD, tx.FXToVND, tx.AmountUSD, tx.AmountVND,
		tx.FeeUSD, tx.FeeVND,
		tx.DeltaQty, tx.CashFlowUSD, tx.CashFlowVND,
		tx.Horizon, tx.EntryDate, tx.ExitDate, tx.FXImpact,
		tx.FXSource, tx.FXTimestamp, tx.CreatedAt, tx.UpdatedAt,
	).Scan(&tx.ID)

	if err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}

	return nil
}

// GetTransaction retrieves a transaction by ID
func (s *transactionService) GetTransaction(ctx context.Context, id string) (*models.Transaction, error) {
	query := `
		SELECT id, date, type, asset, account, counterparty, tag, note,
			   quantity, price_local, amount_local,
			   fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			   fee_usd, fee_vnd,
			   delta_qty, cashflow_usd, cashflow_vnd,
			   horizon, entry_date, exit_date, fx_impact,
			   fx_source, fx_timestamp, created_at, updated_at
		FROM transactions
		WHERE id = $1`

	tx := &models.Transaction{}
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&tx.ID, &tx.Date, &tx.Type, &tx.Asset, &tx.Account, &tx.Counterparty, &tx.Tag, &tx.Note,
		&tx.Quantity, &tx.PriceLocal, &tx.AmountLocal,
		&tx.FXToUSD, &tx.FXToVND, &tx.AmountUSD, &tx.AmountVND,
		&tx.FeeUSD, &tx.FeeVND,
		&tx.DeltaQty, &tx.CashFlowUSD, &tx.CashFlowVND,
		&tx.Horizon, &tx.EntryDate, &tx.ExitDate, &tx.FXImpact,
		&tx.FXSource, &tx.FXTimestamp, &tx.CreatedAt, &tx.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	return tx, nil
}

// ListTransactions retrieves transactions based on filter criteria
func (s *transactionService) ListTransactions(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error) {
	query, args := s.buildListQuery(filter, false)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list transactions: %w", err)
	}
	defer rows.Close()

	var transactions []*models.Transaction
	for rows.Next() {
		tx := &models.Transaction{}
		err := rows.Scan(
			&tx.ID, &tx.Date, &tx.Type, &tx.Asset, &tx.Account, &tx.Counterparty, &tx.Tag, &tx.Note,
			&tx.Quantity, &tx.PriceLocal, &tx.AmountLocal,
			&tx.FXToUSD, &tx.FXToVND, &tx.AmountUSD, &tx.AmountVND,
			&tx.FeeUSD, &tx.FeeVND,
			&tx.DeltaQty, &tx.CashFlowUSD, &tx.CashFlowVND,
			&tx.Horizon, &tx.EntryDate, &tx.ExitDate, &tx.FXImpact,
			&tx.FXSource, &tx.FXTimestamp, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		transactions = append(transactions, tx)
	}

	return transactions, nil
}

// UpdateTransaction updates an existing transaction
func (s *transactionService) UpdateTransaction(ctx context.Context, tx *models.Transaction) error {
	// First, get the existing transaction to merge with the update
	existing, err := s.GetTransaction(ctx, tx.ID)
	if err != nil {
		return fmt.Errorf("failed to get existing transaction: %w", err)
	}

	// Merge the update with existing data to ensure we have all required fields
	merged := s.mergeTransactionUpdate(existing, tx)

	// Now validate and calculate derived fields on the complete transaction
	// Temporarily disabled for debugging
	// if err := merged.PreSave(); err != nil {
	// 	return fmt.Errorf("transaction validation failed: %w", err)
	// }

	// Update timestamp
	merged.UpdatedAt = time.Now()

	query := `
		UPDATE transactions SET
			date = $2, type = $3, asset = $4, account = $5, counterparty = $6, tag = $7, note = $8,
			quantity = $9, price_local = $10, amount_local = $11,
			fx_to_usd = $12, fx_to_vnd = $13, amount_usd = $14, amount_vnd = $15,
			fee_usd = $16, fee_vnd = $17,
			delta_qty = $18, cashflow_usd = $19, cashflow_vnd = $20,
			horizon = $21, entry_date = $22, exit_date = $23, fx_impact = $24,
			fx_source = $25, fx_timestamp = $26, updated_at = $27
		WHERE id = $1`

	// Handle nil pointers for database compatibility
	counterparty := merged.Counterparty
	if counterparty == nil {
		counterparty = new(string)
	}
	tag := merged.Tag
	if tag == nil {
		tag = new(string)
	}
	note := merged.Note
	if note == nil {
		note = new(string)
	}
	horizon := merged.Horizon
	if horizon == nil {
		horizon = new(string)
	}
	fxImpact := merged.FXImpact
	if fxImpact == nil {
		fxImpact = &decimal.Decimal{}
		*fxImpact = decimal.Zero
	}
	fxSource := merged.FXSource
	if fxSource == nil {
		fxSource = new(string)
	}

	// Handle nil time pointers
	var entryDate *time.Time
	if merged.EntryDate != nil {
		entryDate = merged.EntryDate
	}
	var exitDate *time.Time
	if merged.ExitDate != nil {
		exitDate = merged.ExitDate
	}
	var fxTimestamp *time.Time
	if merged.FXTimestamp != nil {
		fxTimestamp = merged.FXTimestamp
	}

	result, err := s.db.ExecContext(ctx, query,
		merged.ID,
		merged.Date, merged.Type, merged.Asset, merged.Account, counterparty, tag, note,
		merged.Quantity, merged.PriceLocal, merged.AmountLocal,
		merged.FXToUSD, merged.FXToVND, merged.AmountUSD, merged.AmountVND,
		merged.FeeUSD, merged.FeeVND,
		merged.DeltaQty, merged.CashFlowUSD, merged.CashFlowVND,
		horizon, entryDate, exitDate, fxImpact,
		fxSource, fxTimestamp, merged.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to update transaction: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no transaction found with id %s", tx.ID)
	}

	// Copy the updated data back to the input transaction for the response
	*tx = *merged

	return nil
}

// DeleteTransaction deletes a transaction by ID
func (s *transactionService) DeleteTransaction(ctx context.Context, id string) error {
	query := `DELETE FROM transactions WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete transaction: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("transaction not found: %s", id)
	}

	return nil
}

// GetTransactionCount returns the count of transactions matching the filter
func (s *transactionService) GetTransactionCount(ctx context.Context, filter *models.TransactionFilter) (int, error) {
	query, args := s.buildListQuery(filter, true)

	var count int
	err := s.db.QueryRowContext(ctx, query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get transaction count: %w", err)
	}

	return count, nil
}

// buildListQuery builds the SQL query for listing transactions or counting them
func (s *transactionService) buildListQuery(filter *models.TransactionFilter, isCount bool) (string, []interface{}) {
	var selectClause string
	if isCount {
		selectClause = "SELECT COUNT(*)"
	} else {
		selectClause = `SELECT id, date, type, asset, account, counterparty, tag, note,
			   quantity, price_local, amount_local,
			   fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			   fee_usd, fee_vnd,
			   delta_qty, cashflow_usd, cashflow_vnd,
			   horizon, entry_date, exit_date, fx_impact,
			   fx_source, fx_timestamp, created_at, updated_at`
	}

	query := selectClause + " FROM transactions"
	var conditions []string
	var args []interface{}
	argIndex := 1

	if filter != nil {
		if filter.StartDate != nil {
			conditions = append(conditions, fmt.Sprintf("date >= $%d", argIndex))
			args = append(args, *filter.StartDate)
			argIndex++
		}

		if filter.EndDate != nil {
			conditions = append(conditions, fmt.Sprintf("date <= $%d", argIndex))
			args = append(args, *filter.EndDate)
			argIndex++
		}

		if len(filter.Types) > 0 {
			placeholders := make([]string, len(filter.Types))
			for i, t := range filter.Types {
				placeholders[i] = fmt.Sprintf("$%d", argIndex)
				args = append(args, t)
				argIndex++
			}
			conditions = append(conditions, fmt.Sprintf("type IN (%s)", strings.Join(placeholders, ",")))
		}

		if len(filter.Assets) > 0 {
			placeholders := make([]string, len(filter.Assets))
			for i, a := range filter.Assets {
				placeholders[i] = fmt.Sprintf("$%d", argIndex)
				args = append(args, a)
				argIndex++
			}
			conditions = append(conditions, fmt.Sprintf("asset IN (%s)", strings.Join(placeholders, ",")))
		}

		if len(filter.Accounts) > 0 {
			placeholders := make([]string, len(filter.Accounts))
			for i, a := range filter.Accounts {
				placeholders[i] = fmt.Sprintf("$%d", argIndex)
				args = append(args, a)
				argIndex++
			}
			conditions = append(conditions, fmt.Sprintf("account IN (%s)", strings.Join(placeholders, ",")))
		}

		if len(filter.Tags) > 0 {
			placeholders := make([]string, len(filter.Tags))
			for i, t := range filter.Tags {
				placeholders[i] = fmt.Sprintf("$%d", argIndex)
				args = append(args, t)
				argIndex++
			}
			conditions = append(conditions, fmt.Sprintf("tag IN (%s)", strings.Join(placeholders, ",")))
		}

		if filter.Counterparty != nil {
			conditions = append(conditions, fmt.Sprintf("counterparty = $%d", argIndex))
			args = append(args, *filter.Counterparty)
			argIndex++
		}
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	if !isCount {
		query += " ORDER BY date DESC, created_at DESC"

		if filter != nil {
			if filter.Limit > 0 {
				query += fmt.Sprintf(" LIMIT $%d", argIndex)
				args = append(args, filter.Limit)
				argIndex++
			}

			if filter.Offset > 0 {
				query += fmt.Sprintf(" OFFSET $%d", argIndex)
				args = append(args, filter.Offset)
				argIndex++
			}
		}
	}

	return query, args
}

// mergeTransactionUpdate merges an update transaction with the existing transaction
// Only non-zero/non-empty fields from the update are applied to the existing transaction
func (s *transactionService) mergeTransactionUpdate(existing, update *models.Transaction) *models.Transaction {
	// Start with a copy of the existing transaction
	merged := &models.Transaction{}
	*merged = *existing

	// Apply non-zero/non-empty updates
	if !update.Date.IsZero() {
		merged.Date = update.Date
	}
	if update.Type != "" {
		merged.Type = update.Type
	}
	if update.Asset != "" {
		merged.Asset = update.Asset
	}
	if update.Account != "" {
		merged.Account = update.Account
	}
	if update.Counterparty != nil && *update.Counterparty != "" {
		merged.Counterparty = update.Counterparty
	}
	if update.Tag != nil && *update.Tag != "" {
		merged.Tag = update.Tag
	}
	if update.Note != nil && *update.Note != "" {
		merged.Note = update.Note
	}
	if !update.Quantity.IsZero() {
		merged.Quantity = update.Quantity
	}
	if !update.PriceLocal.IsZero() {
		merged.PriceLocal = update.PriceLocal
	}
	if !update.FXToUSD.IsZero() {
		merged.FXToUSD = update.FXToUSD
	}
	if !update.FXToVND.IsZero() {
		merged.FXToVND = update.FXToVND
	}
	if !update.FeeUSD.IsZero() {
		merged.FeeUSD = update.FeeUSD
	}
	if !update.FeeVND.IsZero() {
		merged.FeeVND = update.FeeVND
	}
	if update.Horizon != nil && *update.Horizon != "" {
		merged.Horizon = update.Horizon
	}
	if update.EntryDate != nil && !update.EntryDate.IsZero() {
		merged.EntryDate = update.EntryDate
	}
	if update.ExitDate != nil && !update.ExitDate.IsZero() {
		merged.ExitDate = update.ExitDate
	}
	if !update.FXImpact.IsZero() {
		merged.FXImpact = update.FXImpact
	}
	if update.FXSource != nil && *update.FXSource != "" {
		merged.FXSource = update.FXSource
	}
	if update.FXTimestamp != nil && !update.FXTimestamp.IsZero() {
		merged.FXTimestamp = update.FXTimestamp
	}

	return merged
}

// populateFXRates automatically populates FX rates if they are missing and FX provider is available
func (s *transactionService) populateFXRates(ctx context.Context, tx *models.Transaction) error {
	if s.fxProvider == nil {
		// No FX provider available, skip auto-population
		return nil
	}

	// Only populate if FX rates are not already set
	needsUSD := tx.FXToUSD.IsZero()
	needsVND := tx.FXToVND.IsZero()

	if !needsUSD && !needsVND {
		// Both rates already provided
		return nil
	}

	asset := tx.Asset
	date := tx.Date

	// Determine which rates we need
	targets := []string{}
	if needsUSD {
		targets = append(targets, "USD")
	}
	if needsVND {
		targets = append(targets, "VND")
	}

	// Fetch rates
	fetchedRates, err := s.fxProvider.GetRates(ctx, asset, targets, date)
	if err != nil {
		return fmt.Errorf("failed to fetch FX rates for %s: %w", asset, err)
	}

	// Apply fetched rates
	if needsUSD {
		if usdRate, exists := fetchedRates["USD"]; exists {
			tx.FXToUSD = usdRate
			if tx.FXSource == nil {
				source := "auto-fx-provider"
				tx.FXSource = &source
			}
			if tx.FXTimestamp == nil {
				now := time.Now()
				tx.FXTimestamp = &now
			}
		} else {
			return fmt.Errorf("USD rate not available for %s", asset)
		}
	}

	if needsVND {
		if vndRate, exists := fetchedRates["VND"]; exists {
			tx.FXToVND = vndRate
			if tx.FXSource == nil {
				source := "auto-fx-provider"
				tx.FXSource = &source
			}
			if tx.FXTimestamp == nil {
				now := time.Now()
				tx.FXTimestamp = &now
			}
		} else {
			return fmt.Errorf("VND rate not available for %s", asset)
		}
	}

	return nil
}
