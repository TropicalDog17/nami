package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
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
	query := `
		INSERT INTO investments (
			id, asset, account, horizon, deposit_date, deposit_qty, deposit_cost, deposit_unit_cost,
			withdrawal_date, withdrawal_qty, withdrawal_value, withdrawal_unit_price,
			pnl, pnl_percent, is_open, remaining_qty, cost_basis_method, created_at, updated_at
		) VALUES (
			uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11,
			$12, $13, $14, $15, $16, $17, $18
		) RETURNING id`

	err := r.db.QueryRowContext(ctx, query,
		investment.Asset, investment.Account, investment.Horizon, investment.DepositDate,
		investment.DepositQty, investment.DepositCost, investment.DepositUnitCost,
		investment.WithdrawalDate, investment.WithdrawalQty, investment.WithdrawalValue, investment.WithdrawalUnitPrice,
		investment.PnL, investment.PnLPercent, investment.IsOpen, investment.RemainingQty,
		investment.CostBasisMethod, investment.CreatedAt, investment.UpdatedAt,
	).Scan(&investment.ID)

	if err != nil {
		return fmt.Errorf("failed to create investment: %w", err)
	}

	return nil
}

// GetByID retrieves an investment by ID
func (r *investmentRepository) GetByID(ctx context.Context, id string) (*models.Investment, error) {
	query := `
		SELECT id, asset, account, horizon, deposit_date, deposit_qty, deposit_cost, deposit_unit_cost,
			   withdrawal_date, withdrawal_qty, withdrawal_value, withdrawal_unit_price,
			   pnl, pnl_percent, is_open, remaining_qty, cost_basis_method, created_at, updated_at
		FROM investments
		WHERE id = $1`

	investment := &models.Investment{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&investment.ID, &investment.Asset, &investment.Account, &investment.Horizon,
		&investment.DepositDate, &investment.DepositQty, &investment.DepositCost, &investment.DepositUnitCost,
		&investment.WithdrawalDate, &investment.WithdrawalQty, &investment.WithdrawalValue, &investment.WithdrawalUnitPrice,
		&investment.PnL, &investment.PnLPercent, &investment.IsOpen, &investment.RemainingQty,
		&investment.CostBasisMethod, &investment.CreatedAt, &investment.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("investment not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get investment: %w", err)
	}

	return investment, nil
}

// GetByAssetAccount retrieves investments by asset and account
func (r *investmentRepository) GetByAssetAccount(ctx context.Context, asset, account string, isOpen *bool) ([]*models.Investment, error) {
	query := `
		SELECT id, asset, account, horizon, deposit_date, deposit_qty, deposit_cost, deposit_unit_cost,
			   withdrawal_date, withdrawal_qty, withdrawal_value, withdrawal_unit_price,
			   pnl, pnl_percent, is_open, remaining_qty, cost_basis_method, created_at, updated_at
		FROM investments
		WHERE asset = $1 AND account = $2`

	args := []interface{}{asset, account}

	if isOpen != nil {
		query += " AND is_open = $3"
		args = append(args, *isOpen)
	}

	query += " ORDER BY deposit_date DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get investments by asset/account: %w", err)
	}
	defer rows.Close()

	var investments []*models.Investment
	for rows.Next() {
		investment := &models.Investment{}
		err := rows.Scan(
			&investment.ID, &investment.Asset, &investment.Account, &investment.Horizon,
			&investment.DepositDate, &investment.DepositQty, &investment.DepositCost, &investment.DepositUnitCost,
			&investment.WithdrawalDate, &investment.WithdrawalQty, &investment.WithdrawalValue, &investment.WithdrawalUnitPrice,
			&investment.PnL, &investment.PnLPercent, &investment.IsOpen, &investment.RemainingQty,
			&investment.CostBasisMethod, &investment.CreatedAt, &investment.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan investment: %w", err)
		}
		investments = append(investments, investment)
	}

	return investments, nil
}

// List retrieves investments based on filter criteria
func (r *investmentRepository) List(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error) {
	query := `
		SELECT id, asset, account, horizon, deposit_date, deposit_qty, deposit_cost, deposit_unit_cost,
			   withdrawal_date, withdrawal_qty, withdrawal_value, withdrawal_unit_price,
			   pnl, pnl_percent, is_open, remaining_qty, cost_basis_method, created_at, updated_at
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
			query += fmt.Sprintf(" AND is_open = $%d", argIndex)
			args = append(args, *filter.IsOpen)
			argIndex++
		}

		if filter.CostBasisMethod != "" {
			query += fmt.Sprintf(" AND cost_basis_method = $%d", argIndex)
			args = append(args, filter.CostBasisMethod)
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
		return nil, fmt.Errorf("failed to list investments: %w", err)
	}
	defer rows.Close()

	var investments []*models.Investment
	for rows.Next() {
		investment := &models.Investment{}
		err := rows.Scan(
			&investment.ID, &investment.Asset, &investment.Account, &investment.Horizon,
			&investment.DepositDate, &investment.DepositQty, &investment.DepositCost, &investment.DepositUnitCost,
			&investment.WithdrawalDate, &investment.WithdrawalQty, &investment.WithdrawalValue, &investment.WithdrawalUnitPrice,
			&investment.PnL, &investment.PnLPercent, &investment.IsOpen, &investment.RemainingQty,
			&investment.CostBasisMethod, &investment.CreatedAt, &investment.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan investment: %w", err)
		}
		investments = append(investments, investment)
	}

	return investments, nil
}

// GetCount returns the count of investments matching the filter
func (r *investmentRepository) GetCount(ctx context.Context, filter *models.InvestmentFilter) (int, error) {
	query := "SELECT COUNT(*) FROM investments WHERE 1=1"

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
			query += fmt.Sprintf(" AND is_open = $%d", argIndex)
			args = append(args, *filter.IsOpen)
			argIndex++
		}

		if filter.CostBasisMethod != "" {
			query += fmt.Sprintf(" AND cost_basis_method = $%d", argIndex)
			args = append(args, filter.CostBasisMethod)
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

	var count int
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get investment count: %w", err)
	}

	return count, nil
}

// Update updates an investment record
func (r *investmentRepository) Update(ctx context.Context, investment *models.Investment) error {
	query := `
		UPDATE investments SET
			asset = $2, account = $3, horizon = $4, deposit_date = $5,
			deposit_qty = $6, deposit_cost = $7, deposit_unit_cost = $8,
			withdrawal_date = $9, withdrawal_qty = $10, withdrawal_value = $11, withdrawal_unit_price = $12,
			pnl = $13, pnl_percent = $14, is_open = $15, remaining_qty = $16,
			cost_basis_method = $17, updated_at = $18
		WHERE id = $1`

	_, err := r.db.ExecContext(ctx, query,
		investment.ID, investment.Asset, investment.Account, investment.Horizon, investment.DepositDate,
		investment.DepositQty, investment.DepositCost, investment.DepositUnitCost,
		investment.WithdrawalDate, investment.WithdrawalQty, investment.WithdrawalValue, investment.WithdrawalUnitPrice,
		investment.PnL, investment.PnLPercent, investment.IsOpen, investment.RemainingQty,
		investment.CostBasisMethod, time.Now(),
	)

	if err != nil {
		return fmt.Errorf("failed to update investment: %w", err)
	}

	return nil
}

// Delete deletes an investment record
func (r *investmentRepository) Delete(ctx context.Context, id string) error {
	query := "DELETE FROM investments WHERE id = $1"

	_, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete investment: %w", err)
	}

	return nil
}

// GetSummary returns investment summary statistics
func (r *investmentRepository) GetSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error) {
	query := `
		SELECT
			COUNT(*) as total_investments,
			COUNT(CASE WHEN is_open THEN 1 END) as open_investments,
			COUNT(CASE WHEN NOT is_open THEN 1 END) as closed_investments,
			COALESCE(SUM(deposit_cost), 0) as total_deposits,
			COALESCE(SUM(withdrawal_value), 0) as total_withdrawals,
			COALESCE(SUM(pnl), 0) as realized_pnl
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
			query += fmt.Sprintf(" AND is_open = $%d", argIndex)
			args = append(args, *filter.IsOpen)
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

// FindByDepositID finds an investment by the associated deposit transaction ID
func (r *investmentRepository) FindByDepositID(ctx context.Context, depositID string) (*models.Investment, error) {
	// For backward compatibility, we need to find the investment that corresponds to a deposit
	// This looks for investments that have a matching deposit_date and asset/account combination
	query := `
		SELECT i.id, i.asset, i.account, i.horizon, i.deposit_date, i.deposit_qty, i.deposit_cost, i.deposit_unit_cost,
			   i.withdrawal_date, i.withdrawal_qty, i.withdrawal_value, i.withdrawal_unit_price,
			   i.pnl, i.pnl_percent, i.is_open, i.remaining_qty, i.cost_basis_method, i.created_at, i.updated_at
		FROM investments i
		JOIN transactions t ON i.asset = t.asset AND i.account = t.account AND i.deposit_date = t.date
		WHERE t.id = $1 AND t.type IN ('deposit', 'stake', 'buy')`

	investment := &models.Investment{}
	err := r.db.QueryRowContext(ctx, query, depositID).Scan(
		&investment.ID, &investment.Asset, &investment.Account, &investment.Horizon,
		&investment.DepositDate, &investment.DepositQty, &investment.DepositCost, &investment.DepositUnitCost,
		&investment.WithdrawalDate, &investment.WithdrawalQty, &investment.WithdrawalValue, &investment.WithdrawalUnitPrice,
		&investment.PnL, &investment.PnLPercent, &investment.IsOpen, &investment.RemainingQty,
		&investment.CostBasisMethod, &investment.CreatedAt, &investment.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("investment not found for deposit ID: %s", depositID)
		}
		return nil, fmt.Errorf("failed to find investment by deposit ID: %w", err)
	}

	return investment, nil
}

// CreateFromStake creates a new investment from a stake transaction
func (r *investmentRepository) CreateFromStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error) {
	if stakeTx.Type != "stake" {
		return nil, fmt.Errorf("transaction type must be 'stake', got %s", stakeTx.Type)
	}

	// Calculate unit cost from AmountUSD / Quantity
	var depositUnitCost decimal.Decimal
	if stakeTx.Quantity.GreaterThan(decimal.Zero) {
		depositUnitCost = stakeTx.AmountUSD.Div(stakeTx.Quantity)
	} else {
		depositUnitCost = decimal.Zero
	}

	investment := &models.Investment{
		Asset:            stakeTx.Asset,
		Account:          stakeTx.Account,
		Horizon:          stakeTx.Horizon,
		DepositDate:      stakeTx.Date,
		DepositQty:       stakeTx.Quantity,
		DepositCost:      stakeTx.AmountUSD,
		DepositUnitCost:  depositUnitCost,
		WithdrawalQty:    decimal.Zero,
		WithdrawalValue:  decimal.Zero,
		WithdrawalUnitPrice: decimal.Zero,
		PnL:              decimal.Zero,
		PnLPercent:       decimal.Zero,
		IsOpen:           true,
		RemainingQty:     stakeTx.Quantity,
		CostBasisMethod:  "fifo",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := r.Create(ctx, investment)
	if err != nil {
		return nil, fmt.Errorf("failed to create investment from stake: %w", err)
	}

	return investment, nil
}

// FindOpenInvestmentForStake finds an open investment for a stake transaction
func (r *investmentRepository) FindOpenInvestmentForStake(ctx context.Context, asset, account, horizon string) (*models.Investment, error) {
	query := `
		SELECT id, asset, account, horizon, deposit_date, deposit_qty, deposit_cost, deposit_unit_cost,
			   withdrawal_date, withdrawal_qty, withdrawal_value, withdrawal_unit_price,
			   pnl, pnl_percent, is_open, remaining_qty, cost_basis_method, created_at, updated_at
		FROM investments
		WHERE asset = $1 AND account = $2 AND is_open = true`

	args := []interface{}{asset, account}

	// Handle horizon comparison (both could be null)
	if horizon != "" {
		query += " AND (horizon = $3 OR horizon IS NULL)"
		args = append(args, horizon)
	}

	query += " ORDER BY deposit_date ASC LIMIT 1"

	investment := &models.Investment{}
	var horizonValue sql.NullString

	err := r.db.QueryRowContext(ctx, query, args...).Scan(
		&investment.ID, &investment.Asset, &investment.Account, &horizonValue,
		&investment.DepositDate, &investment.DepositQty, &investment.DepositCost, &investment.DepositUnitCost,
		&investment.WithdrawalDate, &investment.WithdrawalQty, &investment.WithdrawalValue, &investment.WithdrawalUnitPrice,
		&investment.PnL, &investment.PnLPercent, &investment.IsOpen, &investment.RemainingQty,
		&investment.CostBasisMethod, &investment.CreatedAt, &investment.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // No open investment found
		}
		return nil, fmt.Errorf("failed to find open investment for stake: %w", err)
	}

	if horizonValue.Valid {
		investment.Horizon = &horizonValue.String
	}

	return investment, nil
}

// UpdateWithStake updates an investment with additional stake transaction
func (r *investmentRepository) UpdateWithStake(ctx context.Context, investment *models.Investment, stakeTx *models.Transaction) error {
	if stakeTx.Type != "stake" {
		return fmt.Errorf("transaction type must be 'stake', got %s", stakeTx.Type)
	}

	// Calculate new weighted average cost
	newTotalQty := investment.DepositQty.Add(stakeTx.Quantity)
	newTotalCost := investment.DepositCost.Add(stakeTx.AmountUSD)
	newUnitCost := newTotalCost.Div(newTotalQty)

	// Update investment with additional stake
	investment.DepositQty = newTotalQty
	investment.DepositCost = newTotalCost
	investment.DepositUnitCost = newUnitCost
	investment.RemainingQty = investment.RemainingQty.Add(stakeTx.Quantity)
	investment.UpdatedAt = time.Now()

	return r.Update(ctx, investment)
}

// UpdateWithUnstake updates an investment with an unstake transaction
func (r *investmentRepository) UpdateWithUnstake(ctx context.Context, investment *models.Investment, unstakeTx *models.Transaction) error {
	if unstakeTx.Type != "unstake" {
		return fmt.Errorf("transaction type must be 'unstake', got %s", unstakeTx.Type)
	}

	// Calculate withdrawal values
	withdrawalQty := unstakeTx.Quantity
	withdrawalValue := unstakeTx.AmountUSD

	// Update withdrawal information
	totalWithdrawalQty := investment.WithdrawalQty.Add(withdrawalQty)
	totalWithdrawalValue := investment.WithdrawalValue.Add(withdrawalValue)

	// Calculate average withdrawal unit price
	var avgWithdrawalPrice decimal.Decimal
	if totalWithdrawalQty.GreaterThan(decimal.Zero) {
		avgWithdrawalPrice = totalWithdrawalValue.Div(totalWithdrawalQty)
	} else {
		avgWithdrawalPrice = decimal.Zero
	}

	// Update remaining quantity
	newRemainingQty := investment.RemainingQty.Sub(withdrawalQty)
	if newRemainingQty.LessThan(decimal.Zero) {
		newRemainingQty = decimal.Zero // Shouldn't happen in practice, but safeguard
	}

	// Calculate realized P&L for this unstake
	costOfWithdrawnQty := withdrawalQty.Mul(investment.DepositUnitCost)
	realizedPnL := withdrawalValue.Sub(costOfWithdrawnQty)
	totalRealizedPnL := investment.PnL.Add(realizedPnL)

	// Calculate P&L percentage
	var pnlPercent decimal.Decimal
	if investment.DepositCost.GreaterThan(decimal.Zero) {
		pnlPercent = totalRealizedPnL.Div(investment.DepositCost).Mul(decimal.NewFromInt(100))
	} else {
		pnlPercent = decimal.Zero
	}

	// Update investment
	investment.WithdrawalQty = totalWithdrawalQty
	investment.WithdrawalValue = totalWithdrawalValue
	investment.WithdrawalUnitPrice = avgWithdrawalPrice
	investment.WithdrawalDate = &unstakeTx.Date
	investment.RemainingQty = newRemainingQty
	investment.PnL = totalRealizedPnL
	investment.PnLPercent = pnlPercent
	investment.IsOpen = newRemainingQty.GreaterThan(decimal.Zero)
	investment.UpdatedAt = time.Now()

	return r.Update(ctx, investment)
}