package repositories

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

type transactionRepository struct {
	db *db.DB
}

// NewTransactionRepository creates a new transaction repository
func NewTransactionRepository(database *db.DB) TransactionRepository {
	return &transactionRepository{db: database}
}

func (r *transactionRepository) Create(ctx context.Context, tx *models.Transaction) error {
	query := `
		INSERT INTO transactions (
			id, date, type, asset, account, counterparty, tag, note,
			quantity, price_local, amount_local,
			fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			fee_usd, fee_vnd,
			delta_qty, cashflow_usd, cashflow_vnd,
			horizon, entry_date, exit_date, fx_impact,
			borrow_apr, borrow_term_days, borrow_active, internal_flow,
			deposit_id,
			fx_source, fx_timestamp, created_at, updated_at
		) VALUES (
			uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10,
			$11, $12, $13, $14,
			$15, $16,
			$17, $18, $19,
			$20, $21, $22, $23,
			$24, $25, $26, $27,
			$28,
			$29, $30, $31, $32
		) RETURNING id`

	err := r.db.QueryRowContext(ctx, query,
		tx.Date, tx.Type, tx.Asset, tx.Account, tx.Counterparty, tx.Tag, tx.Note,
		tx.Quantity, tx.PriceLocal, tx.AmountLocal,
		tx.FXToUSD, tx.FXToVND, tx.AmountUSD, tx.AmountVND,
		tx.FeeUSD, tx.FeeVND,
		tx.DeltaQty, tx.CashFlowUSD, tx.CashFlowVND,
		tx.Horizon, tx.EntryDate, tx.ExitDate, tx.FXImpact,
		tx.BorrowAPR, tx.BorrowTermDays, tx.BorrowActive, tx.InternalFlow,
		tx.DepositID,
		tx.FXSource, tx.FXTimestamp, tx.CreatedAt, tx.UpdatedAt,
	).Scan(&tx.ID)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}

	return nil
}

func (r *transactionRepository) CreateBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error) {
	if len(txs) == 0 {
		return nil, nil
	}

	sqlTx, err := r.db.BeginTx(ctx, nil)
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
            deposit_id,
            fx_source, fx_timestamp, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16,
            $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28,
            $29, $30, $31, $32
        ) RETURNING id`

	for _, t := range txs {
		if t == nil {
			err = fmt.Errorf("nil transaction in batch")
			return nil, err
		}
		t.CreatedAt = time.Now()
		t.UpdatedAt = time.Now()

		scanErr := sqlTx.QueryRowContext(ctx, insertQuery,
			t.Date, t.Type, t.Asset, t.Account, t.Counterparty, t.Tag, t.Note,
			t.Quantity, t.PriceLocal, t.AmountLocal,
			t.FXToUSD, t.FXToVND, t.AmountUSD, t.AmountVND,
			t.FeeUSD, t.FeeVND,
			t.DeltaQty, t.CashFlowUSD, t.CashFlowVND,
			t.Horizon, t.EntryDate, t.ExitDate, t.FXImpact,
			t.BorrowAPR, t.BorrowTermDays, t.BorrowActive, t.InternalFlow,
			t.DepositID,
			t.FXSource, t.FXTimestamp, t.CreatedAt, t.UpdatedAt,
		).Scan(&t.ID)
		if scanErr != nil {
			err = fmt.Errorf("failed to create transaction: %w", scanErr)
			return nil, err
		}
		created = append(created, t)
	}

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

func (r *transactionRepository) GetByID(ctx context.Context, id string) (*models.Transaction, error) {
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
			   deposit_id,
			   fx_source, fx_timestamp, created_at, updated_at
		FROM transactions
		WHERE id = $1`

	tx := &models.Transaction{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&tx.ID, &tx.Date, &tx.Type, &tx.Asset, &tx.Account, &tx.Counterparty, &tx.Tag, &tx.Note,
		&tx.Quantity, &tx.PriceLocal, &tx.AmountLocal,
		&tx.FXToUSD, &tx.FXToVND, &tx.AmountUSD, &tx.AmountVND,
		&tx.FeeUSD, &tx.FeeVND,
		&tx.DeltaQty, &tx.CashFlowUSD, &tx.CashFlowVND,
		&tx.Horizon, &tx.EntryDate, &tx.ExitDate, &tx.FXImpact,
		&tx.BorrowAPR, &tx.BorrowTermDays, &tx.BorrowActive, &tx.InternalFlow,
		&tx.DepositID,
		&tx.FXSource, &tx.FXTimestamp, &tx.CreatedAt, &tx.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows || strings.Contains(strings.ToLower(err.Error()), "invalid input syntax for type uuid") {
			return nil, fmt.Errorf("transaction not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	return tx, nil
}

func (r *transactionRepository) List(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error) {
	query, args := r.buildListQuery(filter, false)

	rows, err := r.db.QueryContext(ctx, query, args...)
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
			&tx.DepositID,
			&tx.FXSource, &tx.FXTimestamp, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		transactions = append(transactions, tx)
	}

	return transactions, nil
}

func (r *transactionRepository) GetCount(ctx context.Context, filter *models.TransactionFilter) (int, error) {
	query, args := r.buildListQuery(filter, true)

	var count int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get transaction count: %w", err)
	}

	return count, nil
}

func (r *transactionRepository) Update(ctx context.Context, tx *models.Transaction) error {
	if tx == nil || tx.ID == "" {
		return fmt.Errorf("no transaction found with id %s", "")
	}

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

	counterparty := tx.Counterparty
	if counterparty == nil {
		counterparty = new(string)
	}
	tag := tx.Tag
	if tag == nil {
		tag = new(string)
	}
	note := tx.Note
	if note == nil {
		note = new(string)
	}
	horizon := tx.Horizon
	if horizon == nil {
		horizon = new(string)
	}
	fxImpact := tx.FXImpact
	if fxImpact == nil {
		fxImpact = &decimal.Decimal{}
		*fxImpact = decimal.Zero
	}
	fxSource := tx.FXSource
	if fxSource == nil {
		fxSource = new(string)
	}

	var entryDate *time.Time
	if tx.EntryDate != nil {
		entryDate = tx.EntryDate
	}
	var exitDate *time.Time
	if tx.ExitDate != nil {
		exitDate = tx.ExitDate
	}
	var fxTimestamp *time.Time
	if tx.FXTimestamp != nil {
		fxTimestamp = tx.FXTimestamp
	}

	result, err := r.db.ExecContext(ctx, query,
		tx.ID,
		tx.Date, tx.Type, tx.Asset, tx.Account, counterparty, tag, note,
		tx.Quantity, tx.PriceLocal, tx.AmountLocal,
		tx.FXToUSD, tx.FXToVND, tx.AmountUSD, tx.AmountVND,
		tx.FeeUSD, tx.FeeVND,
		tx.DeltaQty, tx.CashFlowUSD, tx.CashFlowVND,
		horizon, entryDate, exitDate, fxImpact,
		tx.BorrowAPR, tx.BorrowTermDays, tx.BorrowActive,
		tx.InternalFlow,
		fxSource, fxTimestamp, tx.UpdatedAt,
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

	return nil
}

func (r *transactionRepository) Delete(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	linkQuery := `
		SELECT from_tx
		FROM transaction_links
		WHERE link_type = 'stake_unstake' AND to_tx = $1`

	var linkedDepositID string
	err = tx.QueryRowContext(ctx, linkQuery, id).Scan(&linkedDepositID)

	if err == nil && linkedDepositID != "" {
		if _, updateErr := tx.ExecContext(ctx, `UPDATE transactions SET exit_date = NULL WHERE id = $1`, linkedDepositID); updateErr != nil {
			return fmt.Errorf("failed to clear exit_date: %w", updateErr)
		}
	}

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

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

func (r *transactionRepository) DeleteActionGroup(ctx context.Context, oneID string) (int, error) {
	if oneID == "" {
		return 0, fmt.Errorf("id is required")
	}
	sqlTx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = sqlTx.Rollback()
		}
	}()

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

	ph := make([]string, len(ids))
	args := make([]interface{}, 0, len(ids)*2)
	for i, id := range ids {
		ph[i] = fmt.Sprintf("$%d", i+1)
		args = append(args, id)
	}
	inClause := strings.Join(ph, ",")

	linkQuery := fmt.Sprintf(`DELETE FROM transaction_links WHERE link_type = 'action' AND (from_tx IN (%s) OR to_tx IN (%s))`, inClause, inClause)
	if _, lerr := sqlTx.ExecContext(ctx, linkQuery, append(args, args...)...); lerr != nil {
		err = fmt.Errorf("failed to delete action links: %w", lerr)
		return 0, err
	}

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

func (r *transactionRepository) RecalculateFX(ctx context.Context, onlyMissing bool) (int, error) {
	where := ""
	if onlyMissing {
		where = "WHERE (fx_to_usd = 0 OR fx_to_vnd = 0)"
	}
	query := `SELECT id, date, asset, fx_to_usd, fx_to_vnd FROM transactions ` + where

	rows, err := r.db.QueryContext(ctx, query)
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

	updated := 0
	for _, c := range candidates {
		var quantity, priceLocal, feeUSD, feeVND decimal.Decimal
		var tType, tAccount string
		err := r.db.QueryRowContext(ctx, `SELECT quantity, price_local, fee_usd, fee_vnd, type, account FROM transactions WHERE id = $1`, c.id).
			Scan(&quantity, &priceLocal, &feeUSD, &feeVND, &tType, &tAccount)
		if err != nil {
			continue
		}

		tmp := &models.Transaction{Quantity: quantity, PriceLocal: priceLocal, FXToUSD: c.fxUSD, FXToVND: c.fxVND, FeeUSD: feeUSD, FeeVND: feeVND, Type: tType, Account: tAccount}
		tmp.CalculateDerivedFields()

		_, err = r.db.ExecContext(ctx, `UPDATE transactions SET price_local=$2, fx_to_usd=$3, fx_to_vnd=$4, amount_local=$5, amount_usd=$6, amount_vnd=$7, delta_qty=$8, cashflow_usd=$9, cashflow_vnd=$10, updated_at=$11 WHERE id=$1`,
			c.id, priceLocal, c.fxUSD, c.fxVND, tmp.AmountLocal, tmp.AmountUSD, tmp.AmountVND, tmp.DeltaQty, tmp.CashFlowUSD, tmp.CashFlowVND, time.Now())
		if err == nil {
			updated++
		}
	}

	return updated, nil
}

func (r *transactionRepository) RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error) {
	var date time.Time
	var asset string
	var fxUSD, fxVND, priceLocal decimal.Decimal
	if err := r.db.QueryRowContext(ctx, `SELECT date, asset, fx_to_usd, fx_to_vnd, price_local FROM transactions WHERE id = $1`, id).
		Scan(&date, &asset, &fxUSD, &fxVND, &priceLocal); err != nil {
		return nil, fmt.Errorf("failed to get transaction fields: %w", err)
	}

	var quantity, feeUSD, feeVND decimal.Decimal
	var tType, tAccount string
	if err := r.db.QueryRowContext(ctx, `SELECT quantity, fee_usd, fee_vnd, type, account FROM transactions WHERE id = $1`, id).
		Scan(&quantity, &feeUSD, &feeVND, &tType, &tAccount); err != nil {
		return nil, fmt.Errorf("failed to get transaction compute fields: %w", err)
	}
	tmp := &models.Transaction{Quantity: quantity, PriceLocal: priceLocal, FXToUSD: fxUSD, FXToVND: fxVND, FeeUSD: feeUSD, FeeVND: feeVND, Type: tType, Account: tAccount}
	tmp.CalculateDerivedFields()

	if _, err := r.db.ExecContext(ctx, `UPDATE transactions SET price_local=$2, fx_to_usd=$3, fx_to_vnd=$4, amount_local=$5, amount_usd=$6, amount_vnd=$7, delta_qty=$8, cashflow_usd=$9, cashflow_vnd=$10, updated_at=$11 WHERE id=$1`,
		id, priceLocal, fxUSD, fxVND, tmp.AmountLocal, tmp.AmountUSD, tmp.AmountVND, tmp.DeltaQty, tmp.CashFlowUSD, tmp.CashFlowVND, time.Now()); err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	return r.GetByID(ctx, id)
}

func (r *transactionRepository) buildListQuery(filter *models.TransactionFilter, isCount bool) (string, []interface{}) {
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
			   deposit_id,
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