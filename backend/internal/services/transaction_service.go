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
	db           *db.DB
	fxProvider   FXProvider
	priceService AssetPriceService
}

// NewTransactionService creates a new transaction service
func NewTransactionService(database *db.DB) TransactionService {
	return &transactionService{
		db:           database,
		fxProvider:   nil, // No FX provider
		priceService: nil, // No price service
	}
}

// NewTransactionServiceWithFX creates a new transaction service with FX provider
func NewTransactionServiceWithFX(database *db.DB, fxProvider FXProvider) TransactionService {
	return &transactionService{
		db:           database,
		fxProvider:   fxProvider,
		priceService: nil, // No price service
	}
}

// NewTransactionServiceWithFXAndPrices creates a new transaction service with FX and price providers
func NewTransactionServiceWithFXAndPrices(database *db.DB, fxProvider FXProvider, priceService AssetPriceService) TransactionService {
	return &transactionService{
		db:           database,
		fxProvider:   fxProvider,
		priceService: priceService,
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
			borrow_apr, borrow_term_days, borrow_active, internal_flow,
			fx_source, fx_timestamp, created_at, updated_at
		) VALUES (
			uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10,
			$11, $12, $13, $14,
			$15, $16,
			$17, $18, $19,
			$20, $21, $22, $23,
			$24, $25, $26, $27,
			$28, $29, $30, $31
		) RETURNING id`

	err := s.db.QueryRowContext(ctx, query,
		tx.Date, tx.Type, tx.Asset, tx.Account, tx.Counterparty, tx.Tag, tx.Note,
		tx.Quantity, tx.PriceLocal, tx.AmountLocal,
		tx.FXToUSD, tx.FXToVND, tx.AmountUSD, tx.AmountVND,
		tx.FeeUSD, tx.FeeVND,
		tx.DeltaQty, tx.CashFlowUSD, tx.CashFlowVND,
		tx.Horizon, tx.EntryDate, tx.ExitDate, tx.FXImpact,
		tx.BorrowAPR, tx.BorrowTermDays, tx.BorrowActive, tx.InternalFlow,
		tx.FXSource, tx.FXTimestamp, tx.CreatedAt, tx.UpdatedAt,
	).Scan(&tx.ID)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}

	return nil
}

// CreateTransactionsBatch creates multiple transactions atomically and optionally links them.
func (s *transactionService) CreateTransactionsBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error) {
	if len(txs) == 0 {
		return nil, nil
	}

	// Begin SQL transaction
	sqlTx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = sqlTx.Rollback()
		}
	}()

	created := make([]*models.Transaction, 0, len(txs))

	insertQuery := `
        INSERT INTO transactions (
            id, date, type, asset, account, counterparty, tag, note,
            quantity, price_local, amount_local,
            fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
            fee_usd, fee_vnd,
            delta_qty, cashflow_usd, cashflow_vnd,
            horizon, entry_date, exit_date, fx_impact,
            borrow_apr, borrow_term_days, borrow_active, internal_flow,
            fx_source, fx_timestamp, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16,
            $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29, $30, $31
        ) RETURNING id`

	now := time.Now()
	for _, t := range txs {
		if t == nil {
			err = fmt.Errorf("nil transaction in batch")
			return nil, err
		}
		// Populate FX if needed
		if e := s.populateFXRates(ctx, t); e != nil {
			err = fmt.Errorf("failed to populate FX rates: %w", e)
			return nil, err
		}
		if e := t.PreSave(); e != nil {
			err = fmt.Errorf("transaction validation failed: %w", e)
			return nil, err
		}
		t.CreatedAt = now
		t.UpdatedAt = now

		// Exec insert within the SQL tx
		scanErr := sqlTx.QueryRowContext(ctx, insertQuery,
			t.Date, t.Type, t.Asset, t.Account, t.Counterparty, t.Tag, t.Note,
			t.Quantity, t.PriceLocal, t.AmountLocal,
			t.FXToUSD, t.FXToVND, t.AmountUSD, t.AmountVND,
			t.FeeUSD, t.FeeVND,
			t.DeltaQty, t.CashFlowUSD, t.CashFlowVND,
			t.Horizon, t.EntryDate, t.ExitDate, t.FXImpact,
			t.BorrowAPR, t.BorrowTermDays, t.BorrowActive, t.InternalFlow,
			t.FXSource, t.FXTimestamp, t.CreatedAt, t.UpdatedAt,
		).Scan(&t.ID)
		if scanErr != nil {
			err = fmt.Errorf("failed to create transaction: %w", scanErr)
			return nil, err
		}
		created = append(created, t)
	}

	// Optional linking: star topology from the first tx to others
	if linkType != "" && len(created) > 1 {
		linkStmt, prepErr := sqlTx.PrepareContext(ctx, `INSERT INTO transaction_links (link_type, from_tx, to_tx) VALUES ($1, $2, $3)`)
		if prepErr != nil {
			err = fmt.Errorf("failed to prepare link insert: %w", prepErr)
			return nil, err
		}
		defer linkStmt.Close()
		rootID := created[0].ID
		for i := 1; i < len(created); i++ {
			if _, execErr := linkStmt.ExecContext(ctx, linkType, rootID, created[i].ID); execErr != nil {
				err = fmt.Errorf("failed to insert link: %w", execErr)
				return nil, err
			}
		}
	}

	if err = sqlTx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit tx: %w", err)
	}
	return created, nil
}

// DeleteActionGroup deletes all transactions linked by an action group that includes oneID.
func (s *transactionService) DeleteActionGroup(ctx context.Context, oneID string) (int, error) {
	if oneID == "" {
		return 0, fmt.Errorf("id is required")
	}
	sqlTx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = sqlTx.Rollback()
		}
	}()

	// Find action group root: any link_type='action' rows that connect to oneID.
	// We delete all tx ids in the connected component formed by star topology.
	// Strategy: find root candidates where from_tx in links that have either from_tx=oneID or to_tx=oneID.
	// If oneID is not in any link, delete only that transaction.

	// Gather candidate ids in this group
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

	rows, qerr := sqlTx.QueryContext(ctx, queryIDs, oneID)
	if qerr != nil {
		err = fmt.Errorf("failed to query group ids: %w", qerr)
		return 0, err
	}
	defer rows.Close()

	ids := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if scanErr := rows.Scan(&id); scanErr != nil {
			err = fmt.Errorf("failed to scan id: %w", scanErr)
			return 0, err
		}
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		// Not linked; delete the single row
		res, derr := sqlTx.ExecContext(ctx, `DELETE FROM transactions WHERE id = $1`, oneID)
		if derr != nil {
			err = fmt.Errorf("failed to delete transaction: %w", derr)
			return 0, err
		}
		n, _ := res.RowsAffected()
		if cerr := sqlTx.Commit(); cerr != nil {
			return int(n), fmt.Errorf("failed to commit: %w", cerr)
		}
		return int(n), nil
	}

	// Build placeholders for IN clauses
	ph := make([]string, len(ids))
	args := make([]interface{}, 0, len(ids)*2)
	for i, id := range ids {
		ph[i] = fmt.Sprintf("$%d", i+1)
		args = append(args, id)
	}
	inClause := strings.Join(ph, ",")

	// Delete links first (ON DELETE CASCADE would also handle via transaction FK, but be explicit and scoped)
	linkQuery := fmt.Sprintf(`DELETE FROM transaction_links WHERE link_type = 'action' AND (from_tx IN (%s) OR to_tx IN (%s))`, inClause, inClause)
	if _, lerr := sqlTx.ExecContext(ctx, linkQuery, append(args, args...)...); lerr != nil {
		err = fmt.Errorf("failed to delete action links: %w", lerr)
		return 0, err
	}
	// Delete all transactions in group
	delQuery := fmt.Sprintf(`DELETE FROM transactions WHERE id IN (%s)`, inClause)
	res, derr := sqlTx.ExecContext(ctx, delQuery, args...)
	if derr != nil {
		err = fmt.Errorf("failed to delete transactions: %w", derr)
		return 0, err
	}
	affected, _ := res.RowsAffected()
	if cerr := sqlTx.Commit(); cerr != nil {
		return int(affected), fmt.Errorf("failed to commit: %w", cerr)
	}
	return int(affected), nil
}

// pqStringArray converts []string to a driver-friendly array parameter
func pqStringArray(items []string) interface{} {
	// Rely on pq array inference by using the pg-style array literal via sql package isn't straightforward here.
	// We can use the text[] cast pattern.
	// However, since we're using Exec with ANY($1), most drivers require pq.Array.
	// To avoid importing lib/pq here, we pass as []any for IN building; keep simple using ANY with text[] literal.
	// Fallback: build a text array literal. Ensure proper escaping is not needed for UUIDs.
	// NOTE: Using this helper for simplicity within this codebase; consider pq.Array in future.
	return interface{}(items)
}

// RecalculateFX recalculates FX rates and derived amounts for existing transactions.
// If onlyMissing is true, only updates rows where FX is zero for either USD or VND.
func (s *transactionService) RecalculateFX(ctx context.Context, onlyMissing bool) (int, error) {
	if s.fxProvider == nil {
		return 0, fmt.Errorf("no FX provider configured")
	}

	// Select candidate rows
	where := ""
	if onlyMissing {
		where = "WHERE (fx_to_usd = 0 OR fx_to_vnd = 0)"
	}
	query := `SELECT id, date, asset, fx_to_usd, fx_to_vnd FROM transactions ` + where

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to list transactions for FX recalc: %w", err)
	}
	defer rows.Close()

	type rec struct {
		id    string
		date  time.Time
		asset string
		fxUSD decimal.Decimal
		fxVND decimal.Decimal
	}
	var candidates []rec
	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.id, &r.date, &r.asset, &r.fxUSD, &r.fxVND); err != nil {
			return 0, fmt.Errorf("failed to scan: %w", err)
		}
		candidates = append(candidates, r)
	}

	// For each, fetch rates and update
	updated := 0
	for _, c := range candidates {
		// Recompute derived amounts using existing quantity/price/fees, type and account
		var quantity, priceLocal, feeUSD, feeVND decimal.Decimal
		var tType, tAccount string
		err := s.db.QueryRowContext(ctx, `SELECT quantity, price_local, fee_usd, fee_vnd, type, account FROM transactions WHERE id = $1`, c.id).
			Scan(&quantity, &priceLocal, &feeUSD, &feeVND, &tType, &tAccount)
		if err != nil {
			continue
		}

		// For cryptocurrencies, refresh the price from the price provider
		if models.IsCryptocurrency(c.asset) && s.priceService != nil {
			// Fetch the latest price in USD
			ap, err := s.priceService.GetDaily(ctx, c.asset, "USD", c.date)
			if err == nil && ap != nil && !ap.Price.IsZero() {
				priceLocal = ap.Price
			}
			// For crypto, always set FX rates to 1 (price is already in USD)
			c.fxUSD = decimal.NewFromInt(1)
			c.fxVND = decimal.NewFromInt(1)
		} else {
			// For fiat currencies, use the FX provider
			tx := &models.Transaction{ID: c.id, Date: c.date, Asset: c.asset, FXToUSD: c.fxUSD, FXToVND: c.fxVND}
			// Force refresh both FX rates when onlyMissing == false
			if !onlyMissing {
				tx.FXToUSD = decimal.Zero
				tx.FXToVND = decimal.Zero
			}
			if err := s.populateFXRates(ctx, tx); err != nil {
				// skip on failure, continue
				continue
			}
			c.fxUSD = tx.FXToUSD
			c.fxVND = tx.FXToVND
		}

		tmp := &models.Transaction{Quantity: quantity, PriceLocal: priceLocal, FXToUSD: c.fxUSD, FXToVND: c.fxVND, FeeUSD: feeUSD, FeeVND: feeVND, Type: tType, Account: tAccount}
		tmp.CalculateDerivedFields()

		_, err = s.db.ExecContext(ctx, `UPDATE transactions SET price_local=$2, fx_to_usd=$3, fx_to_vnd=$4, amount_local=$5, amount_usd=$6, amount_vnd=$7, delta_qty=$8, cashflow_usd=$9, cashflow_vnd=$10, updated_at=$11 WHERE id=$1`,
			c.id, priceLocal, c.fxUSD, c.fxVND, tmp.AmountLocal, tmp.AmountUSD, tmp.AmountVND, tmp.DeltaQty, tmp.CashFlowUSD, tmp.CashFlowVND, time.Now())
		if err == nil {
			updated++
		}
	}

	return updated, nil
}

// RecalculateOneFX recalculates FX and derived fields for a single transaction by ID.
// If onlyMissing is true, preserves existing non-zero FX values; otherwise forces refresh.
// For cryptocurrencies, also refreshes the price_local from the price provider.
func (s *transactionService) RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error) {
	// Get minimal fields required to fetch FX and price
	var date time.Time
	var asset string
	var fxUSD, fxVND, priceLocal decimal.Decimal
	if err := s.db.QueryRowContext(ctx, `SELECT date, asset, fx_to_usd, fx_to_vnd, price_local FROM transactions WHERE id = $1`, id).
		Scan(&date, &asset, &fxUSD, &fxVND, &priceLocal); err != nil {
		return nil, fmt.Errorf("failed to get transaction fields: %w", err)
	}

	// For cryptocurrencies, refresh the price from the price provider
	if models.IsCryptocurrency(asset) && s.priceService != nil {
		// Fetch the latest price in USD
		ap, err := s.priceService.GetDaily(ctx, asset, "USD", date)
		if err == nil && ap != nil && !ap.Price.IsZero() {
			priceLocal = ap.Price
		}
		// For crypto, always set FX rates to 1 (price is already in USD)
		fxUSD = decimal.NewFromInt(1)
		fxVND = decimal.NewFromInt(1)
	} else {
		// For fiat currencies, use the FX provider
		if s.fxProvider == nil {
			return nil, fmt.Errorf("no FX provider configured")
		}
		tx := &models.Transaction{ID: id, Date: date, Asset: asset, FXToUSD: fxUSD, FXToVND: fxVND}
		if !onlyMissing {
			tx.FXToUSD = decimal.Zero
			tx.FXToVND = decimal.Zero
		}
		if err := s.populateFXRates(ctx, tx); err != nil {
			return nil, err
		}
		fxUSD = tx.FXToUSD
		fxVND = tx.FXToVND
	}

	// Load existing amounts to recompute derived fields
	var quantity, feeUSD, feeVND decimal.Decimal
	var tType, tAccount string
	if err := s.db.QueryRowContext(ctx, `SELECT quantity, fee_usd, fee_vnd, type, account FROM transactions WHERE id = $1`, id).
		Scan(&quantity, &feeUSD, &feeVND, &tType, &tAccount); err != nil {
		return nil, fmt.Errorf("failed to get transaction compute fields: %w", err)
	}
	tmp := &models.Transaction{Quantity: quantity, PriceLocal: priceLocal, FXToUSD: fxUSD, FXToVND: fxVND, FeeUSD: feeUSD, FeeVND: feeVND, Type: tType, Account: tAccount}
	tmp.CalculateDerivedFields()

	// Apply update (now also updating price_local for crypto)
	if _, err := s.db.ExecContext(ctx, `UPDATE transactions SET price_local=$2, fx_to_usd=$3, fx_to_vnd=$4, amount_local=$5, amount_usd=$6, amount_vnd=$7, delta_qty=$8, cashflow_usd=$9, cashflow_vnd=$10, updated_at=$11 WHERE id=$1`,
		id, priceLocal, fxUSD, fxVND, tmp.AmountLocal, tmp.AmountUSD, tmp.AmountVND, tmp.DeltaQty, tmp.CashFlowUSD, tmp.CashFlowVND, time.Now()); err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	// Return full transaction
	return s.GetTransaction(ctx, id)
}

// ExportTransactions returns all transactions
func (s *transactionService) ExportTransactions(ctx context.Context) ([]*models.Transaction, error) {
	txs, err := s.ListTransactions(ctx, nil)
	if err != nil {
		return nil, err
	}
	return txs, nil
}

// ImportTransactions imports transactions; when upsert is true, update existing by ID
func (s *transactionService) ImportTransactions(ctx context.Context, txs []*models.Transaction, upsert bool) (int, error) {
	if len(txs) == 0 {
		return 0, nil
	}
	count := 0
	for _, t := range txs {
		if upsert && t.ID != "" {
			// Try update existing minimal: re-use UpdateTransaction which merges and recalculates
			if err := s.UpdateTransaction(ctx, t); err == nil {
				count++
				continue
			}
			// fall through to create if update failed
		}
		if err := s.CreateTransaction(ctx, t); err == nil {
			count++
		}
	}
	return count, nil
}

// GetTransaction retrieves a transaction by ID
func (s *transactionService) GetTransaction(ctx context.Context, id string) (*models.Transaction, error) {
	// Normalize error behavior for invalid UUIDs or non-existing ids
	if id == "" {
		return nil, fmt.Errorf("transaction not found: %s", id)
	}
	query := `
		SELECT id, date, type, asset, account, counterparty, tag, note,
			   quantity, price_local, amount_local,
			   fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			   fee_usd, fee_vnd,
			   delta_qty, cashflow_usd, cashflow_vnd,
			   horizon, entry_date, exit_date, fx_impact,
		       borrow_apr, borrow_term_days, borrow_active, internal_flow,
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
		&tx.BorrowAPR, &tx.BorrowTermDays, &tx.BorrowActive, &tx.InternalFlow,
		&tx.FXSource, &tx.FXTimestamp, &tx.CreatedAt, &tx.UpdatedAt,
	)
	if err != nil {
		// Hide database uuid cast errors behind a consistent not-found message
		if err == sql.ErrNoRows || strings.Contains(strings.ToLower(err.Error()), "invalid input syntax for type uuid") {
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
			&tx.BorrowAPR, &tx.BorrowTermDays, &tx.BorrowActive, &tx.InternalFlow,
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
	if tx == nil || tx.ID == "" {
		return fmt.Errorf("no transaction found with id %s", "")
	}
	// First, get the existing transaction to merge with the update
	existing, err := s.GetTransaction(ctx, tx.ID)
	if err != nil {
		// If the underlying cause is not-found, standardize the error message expected by tests
		if strings.Contains(err.Error(), "transaction not found:") {
			return fmt.Errorf("no transaction found with id %s", tx.ID)
		}
		return fmt.Errorf("failed to get existing transaction: %w", err)
	}

	// Merge the update with existing data to ensure we have all required fields
	merged := s.mergeTransactionUpdate(existing, tx)

	// Recalculate derived fields based on merged data
	merged.CalculateDerivedFields()

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
			borrow_apr = $25, borrow_term_days = $26, borrow_active = $27,
			internal_flow = $28,
			fx_source = $29, fx_timestamp = $30, updated_at = $31
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
		merged.BorrowAPR, merged.BorrowTermDays, merged.BorrowActive,
		merged.InternalFlow,
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
	// Use a transaction to ensure atomicity when clearing exit_date before deletion
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Before deleting, check if this is a withdraw transaction linked to a deposit (stake/unstake pair)
	// If so, clear the exit_date on the linked deposit to make it "active" again
	// IMPORTANT: Query the link BEFORE deleting because ON DELETE CASCADE will remove the link
	linkQuery := `
		SELECT from_tx
		FROM transaction_links
		WHERE link_type = 'stake_unstake' AND to_tx = $1`

	var linkedDepositID string
	err = tx.QueryRowContext(ctx, linkQuery, id).Scan(&linkedDepositID)

	// Clear the exit_date BEFORE deleting the transaction (to avoid CASCADE removing the link first)
	if err == nil && linkedDepositID != "" {
		// Clear the exit_date on the linked deposit
		if _, updateErr := tx.ExecContext(ctx, `UPDATE transactions SET exit_date = NULL WHERE id = $1`, linkedDepositID); updateErr != nil {
			return fmt.Errorf("failed to clear exit_date: %w", updateErr)
		}
	}
	// If no link found or error, continue with deletion anyway

	query := `DELETE FROM transactions WHERE id = $1`

	result, err := tx.ExecContext(ctx, query, id)
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

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
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
		       borrow_apr, borrow_term_days, borrow_active, internal_flow,
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
	if update.FXImpact != nil && !update.FXImpact.IsZero() {
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

	// Skip FX rate population for cryptocurrencies
	// Cryptocurrencies don't have FX rates - they have prices in other currencies
	if models.IsCryptocurrency(asset) {
		// For cryptocurrencies, set FX rates to 1.0 to avoid errors
		// The actual valuation should be done via price providers, not FX rates
		if needsUSD {
			tx.FXToUSD = decimal.NewFromInt(1)
		}
		if needsVND {
			tx.FXToVND = decimal.NewFromInt(1)
		}
		return nil
	}

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
