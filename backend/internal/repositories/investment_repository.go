package repositories

import (
	"context"
	"fmt"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// InvestmentRepository defines the interface for investment tracking operations
type InvestmentRepository interface {
	GetInvestments(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error)
	GetInvestmentByID(ctx context.Context, depositID string) (*models.Investment, error)
	GetInvestmentSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error)
	CreateInvestment(ctx context.Context, deposit *models.Transaction) (*models.Investment, error)
	CloseInvestment(ctx context.Context, withdrawal *models.Transaction) (*models.Investment, error)
	GetAvailableDeposits(ctx context.Context, asset, account string) ([]*models.Investment, error)
	GetWithdrawalsForDeposit(ctx context.Context, depositID string) ([]*models.Transaction, error)
}

type investmentRepository struct {
	db *db.DB
}

// NewInvestmentRepository creates a new investment repository
func NewInvestmentRepository(database *db.DB) InvestmentRepository {
	return &investmentRepository{db: database}
}

func (r *investmentRepository) GetInvestments(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error) {
	query := `
		WITH deposits AS (
			SELECT
				id as deposit_id,
				date as deposit_date,
				asset,
				account,
				horizon,
				quantity as deposit_qty,
				amount_usd as deposit_cost,
				amount_usd / quantity as deposit_unit_cost,
				created_at,
				updated_at
			FROM transactions
			WHERE type IN ('deposit', 'stake', 'buy')
		),
		withdrawal_summary AS (
			SELECT
				deposit_id,
				COUNT(*) as withdrawal_count,
				SUM(quantity) as total_withdrawn_qty,
				SUM(amount_usd) as total_withdrawn_value,
				MAX(id) as latest_withdrawal_id,
				MAX(date) as latest_withdrawal_date,
				SUM(amount_usd) / SUM(quantity) as avg_withdrawal_unit_price
			FROM transactions
			WHERE deposit_id IS NOT NULL
			GROUP BY deposit_id
		),
		investments AS (
			SELECT
				d.deposit_id,
				d.asset,
				d.account,
				d.horizon,
				d.deposit_date,
				d.deposit_qty,
				d.deposit_cost,
				d.deposit_unit_cost,
				d.created_at,
				d.updated_at,
				COALESCE(ws.withdrawal_count, 0) as withdrawal_count,
				COALESCE(ws.total_withdrawn_qty, 0) as total_withdrawn_qty,
				COALESCE(ws.total_withdrawn_value, 0) as total_withdrawn_value,
				ws.latest_withdrawal_id,
				ws.latest_withdrawal_date,
				COALESCE(ws.avg_withdrawal_unit_price, 0) as avg_withdrawal_unit_price,
				-- Calculate remaining quantity
				d.deposit_qty - COALESCE(ws.total_withdrawn_qty, 0) as remaining_qty,
				-- Check if fully closed
				CASE
					WHEN d.deposit_qty <= COALESCE(ws.total_withdrawn_qty, 0) THEN true
					ELSE false
				END as is_closed
			FROM deposits d
			LEFT JOIN withdrawal_summary ws ON d.deposit_id = ws.deposit_id
		)
		SELECT
			deposit_id,
			CASE WHEN is_closed THEN latest_withdrawal_id ELSE NULL END as withdrawal_id,
			asset,
			account,
			horizon,
			deposit_date,
			deposit_qty,
			deposit_cost,
			deposit_unit_cost,
			CASE WHEN is_closed THEN latest_withdrawal_date ELSE NULL END as withdrawal_date,
			CASE WHEN is_closed THEN total_withdrawn_qty ELSE decimal.Zero END as withdrawal_qty,
			CASE WHEN is_closed THEN total_withdrawn_value ELSE decimal.Zero END as withdrawal_value,
			CASE WHEN is_closed THEN avg_withdrawal_unit_price ELSE decimal.Zero END as withdrawal_unit_price,
			-- Calculate realized P&L (only if closed)
			CASE
				WHEN is_closed THEN total_withdrawn_value - (total_withdrawn_qty * deposit_unit_cost)
				ELSE decimal.Zero
			END as pnl,
			-- Calculate P&L percentage (only if closed)
			CASE
				WHEN is_closed AND deposit_unit_cost > 0 THEN
					((total_withdrawn_value - (total_withdrawn_qty * deposit_unit_cost)) / (total_withdrawn_qty * deposit_unit_cost)) * 100
				ELSE decimal.Zero
			END as pnl_percent,
			is_closed,
			remaining_qty,
			created_at,
			updated_at
		FROM investments
		WHERE 1=1`

	args := []interface{}{}
	argIndex := 1

	if filter != nil {
		if filter.Asset != "" {
			query += fmt.Sprintf(" AND asset = $%d", argIndex)
			args = append(args, filter.Asset)
			argIndex++
		}

		if filter.Account != "" {
			query += fmt.Sprintf(" AND account = $%d", argIndex)
			args = append(args, filter.Account)
			argIndex++
		}

		if filter.Horizon != "" {
			query += fmt.Sprintf(" AND horizon = $%d", argIndex)
			args = append(args, filter.Horizon)
			argIndex++
		}

		if filter.IsOpen != nil {
			if *filter.IsOpen {
				query += " AND is_closed = false AND remaining_qty > 0"
			} else {
				query += " AND is_closed = true"
			}
		}

		if filter.DepositID != "" {
			query += fmt.Sprintf(" AND deposit_id = $%d", argIndex)
			args = append(args, filter.DepositID)
			argIndex++
		}

		if filter.StartDate != nil {
			query += fmt.Sprintf(" AND deposit_date >= $%d", argIndex)
			args = append(args, *filter.StartDate)
			argIndex++
		}

		if filter.EndDate != nil {
			query += fmt.Sprintf(" AND deposit_date <= $%d", argIndex)
			args = append(args, *filter.EndDate)
			argIndex++
		}
	}

	query += " ORDER BY deposit_date DESC"

	if filter != nil && filter.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, filter.Limit)
		argIndex++

		if filter.Offset > 0 {
			query += fmt.Sprintf(" OFFSET $%d", argIndex)
			args = append(args, filter.Offset)
		}
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get investments: %w", err)
	}
	defer rows.Close()

	var investments []*models.Investment
	for rows.Next() {
		inv := &models.Investment{}
		err := rows.Scan(
			&inv.DepositID,
			&inv.WithdrawalID,
			&inv.Asset,
			&inv.Account,
			&inv.Horizon,
			&inv.DepositDate,
			&inv.DepositQty,
			&inv.DepositCost,
			&inv.DepositUnitCost,
			&inv.WithdrawalDate,
			&inv.WithdrawalQty,
			&inv.WithdrawalValue,
			&inv.WithdrawalUnitPrice,
			&inv.PnL,
			&inv.PnLPercent,
			&inv.IsOpen,
			&inv.RemainingQty,
			&inv.CreatedAt,
			&inv.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan investment: %w", err)
		}

		// Calculate is_open based on remaining_qty
		inv.IsOpen = inv.RemainingQty.GreaterThan(decimal.Zero) && inv.WithdrawalID == nil

		investments = append(investments, inv)
	}

	return investments, nil
}

func (r *investmentRepository) GetInvestmentByID(ctx context.Context, depositID string) (*models.Investment, error) {
	filter := &models.InvestmentFilter{DepositID: depositID}
	investments, err := r.GetInvestments(ctx, filter)
	if err != nil {
		return nil, err
	}

	if len(investments) == 0 {
		return nil, fmt.Errorf("investment not found: %s", depositID)
	}

	return investments[0], nil
}

func (r *investmentRepository) GetInvestmentSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error) {
	query := `
		WITH deposits AS (
			SELECT
				id as deposit_id,
				asset,
				account,
				horizon,
				quantity as deposit_qty,
				amount_usd as deposit_cost,
				date as deposit_date
			FROM transactions
			WHERE type IN ('deposit', 'stake', 'buy')
		),
		withdrawals AS (
			SELECT
				deposit_id,
				quantity as withdrawal_qty,
				amount_usd as withdrawal_value
			FROM transactions
			WHERE deposit_id IS NOT NULL
		),
		investments AS (
			SELECT
				d.*,
				COALESCE(SUM(w.withdrawal_qty), 0) as total_withdrawn_qty,
				COALESCE(SUM(w.withdrawal_value), 0) as total_withdrawn_value,
				COUNT(w.withdrawal_qty) as withdrawal_count
			FROM deposits d
			LEFT JOIN withdrawals w ON d.deposit_id = w.deposit_id
			GROUP BY d.deposit_id, d.asset, d.account, d.horizon, d.deposit_qty, d.deposit_cost, d.deposit_date
		)
		SELECT
			COUNT(*) as total_investments,
			COUNT(CASE WHEN withdrawal_count = 0 OR (deposit_qty - total_withdrawn_qty) > 0 THEN 1 END) as open_investments,
			COUNT(CASE WHEN withdrawal_count > 0 AND (deposit_qty - total_withdrawn_qty) = 0 THEN 1 END) as closed_investments,
			COALESCE(SUM(deposit_cost), 0) as total_deposits,
			COALESCE(SUM(total_withdrawn_value), 0) as total_withdrawals,
			COALESCE(SUM(total_withdrawn_value - (total_withdrawn_qty * (deposit_cost / deposit_qty))), 0) as realized_pnl
		FROM investments`

	args := []interface{}{}
	argIndex := 1

	if filter != nil {
		if filter.Asset != "" {
			query += fmt.Sprintf(" WHERE asset = $%d", argIndex)
			args = append(args, filter.Asset)
			argIndex++
		}

		if filter.Account != "" {
			if argIndex == 1 {
				query += " WHERE"
			} else {
				query += " AND"
			}
			query += fmt.Sprintf(" account = $%d", argIndex)
			args = append(args, filter.Account)
			argIndex++
		}
	}

	summary := &models.InvestmentSummary{}
	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&summary.TotalInvestments,
		&summary.OpenInvestments,
		&summary.ClosedInvestments,
		&summary.TotalDeposits,
		&summary.TotalWithdrawals,
		&summary.RealizedPnL,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get investment summary: %w", err)
	}

	// Calculate derived values
	summary.TotalPnL = summary.RealizedPnL.Add(summary.UnrealizedPnL)

	if summary.TotalDeposits.GreaterThan(decimal.Zero) {
		summary.ROI = summary.TotalPnL.Div(summary.TotalDeposits).Mul(decimal.NewFromInt(100))
	}

	return summary, nil
}

func (r *investmentRepository) CreateInvestment(ctx context.Context, deposit *models.Transaction) (*models.Investment, error) {
	// This is mainly for creating the investment view after a deposit transaction
	// The actual deposit creation is handled by the transaction repository
	return r.GetInvestmentByID(ctx, deposit.ID)
}

func (r *investmentRepository) CloseInvestment(ctx context.Context, withdrawal *models.Transaction) (*models.Investment, error) {
	// This is mainly for updating the investment view after a withdrawal transaction
	// The actual withdrawal creation is handled by the transaction repository
	if withdrawal.DepositID == nil {
		return nil, fmt.Errorf("withdrawal must have deposit_id")
	}
	return r.GetInvestmentByID(ctx, *withdrawal.DepositID)
}

func (r *investmentRepository) GetAvailableDeposits(ctx context.Context, asset, account string) ([]*models.Investment, error) {
	filter := &models.InvestmentFilter{
		Asset:   asset,
		Account: account,
		IsOpen:  &[]bool{true}[0], // pointer to true
	}
	return r.GetInvestments(ctx, filter)
}

func (r *investmentRepository) GetWithdrawalsForDeposit(ctx context.Context, depositID string) ([]*models.Transaction, error) {
	query := `
		SELECT id, date, type, asset, account, counterparty, tag, note,
			   quantity, price_local, amount_local,
			   fx_to_usd, fx_to_vnd, amount_usd, amount_vnd,
			   fee_usd, fee_vnd,
			   delta_qty, cashflow_usd, cashflow_vnd,
			   horizon, entry_date, exit_date, fx_impact,
		       borrow_apr, borrow_term_days, borrow_active, internal_flow,
			   fx_source, fx_timestamp, created_at, updated_at,
			   deposit_id
		FROM transactions
		WHERE deposit_id = $1
		ORDER BY date ASC`

	rows, err := r.db.QueryContext(ctx, query, depositID)
	if err != nil {
		return nil, fmt.Errorf("failed to get withdrawals for deposit: %w", err)
	}
	defer rows.Close()

	var withdrawals []*models.Transaction
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
			&tx.DepositID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan withdrawal: %w", err)
		}
		withdrawals = append(withdrawals, tx)
	}

	return withdrawals, nil
}