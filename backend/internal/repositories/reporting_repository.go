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

type reportingRepository struct {
	db *db.DB
}

// NewReportingRepository creates a new reporting repository
func NewReportingRepository(database *db.DB) ReportingRepository {
	return &reportingRepository{db: database}
}

// getSQLDB returns the underlying SQL database for complex queries
func (r *reportingRepository) getSQLDB() (*sql.DB, error) {
	return r.db.GetSQLDB()
}

func (r *reportingRepository) GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	query := `
		WITH latest_positions AS (
			SELECT
				asset,
				account,
				SUM(delta_qty) as total_quantity,
				MAX(date) as last_transaction_date
			FROM transactions
			WHERE date <= $1
			GROUP BY asset, account
			HAVING SUM(delta_qty) != 0
		),
		latest_prices AS (
			SELECT DISTINCT ON (asset)
				asset,
				price_local,
				amount_usd / NULLIF(quantity, 0) as price_usd,
				fx_to_usd,
				fx_to_vnd
			FROM transactions
			WHERE date <= $1 AND quantity > 0
			ORDER BY asset, date DESC
		),
		usd_to_vnd_rate AS (
			SELECT rate
			FROM fx_rates
			WHERE from_currency = 'USD' AND to_currency = 'VND'
			AND date <= $1
			ORDER BY date DESC
			LIMIT 1
		)
		SELECT
			lp.asset,
			lp.account,
			lp.total_quantity,
			COALESCE(pr.price_usd * lp.total_quantity, 0) as value_usd,
			COALESCE(pr.price_usd * lp.total_quantity * (SELECT COALESCE(rate, 25000) FROM usd_to_vnd_rate), 0) as value_vnd,
			lp.last_transaction_date
		FROM latest_positions lp
		LEFT JOIN latest_prices pr ON lp.asset = pr.asset
		WHERE lp.total_quantity != 0
		ORDER BY lp.asset, lp.account`

	rows, err := sqlDB.QueryContext(ctx, query, asOf)
	if err != nil {
		return nil, fmt.Errorf("failed to get holdings: %w", err)
	}
	defer rows.Close()

	var holdings []*models.Holding
	for rows.Next() {
		h := &models.Holding{}
		err := rows.Scan(
			&h.Asset, &h.Account, &h.Quantity,
			&h.ValueUSD, &h.ValueVND, &h.LastUpdated,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan holding: %w", err)
		}
		holdings = append(holdings, h)
	}

	var totalValueUSD decimal.Decimal
	for _, h := range holdings {
		totalValueUSD = totalValueUSD.Add(h.ValueUSD)
	}

	if !totalValueUSD.IsZero() {
		for _, h := range holdings {
			h.Percentage = h.ValueUSD.Div(totalValueUSD).Mul(decimal.NewFromInt(100))
		}
	}

	return holdings, nil
}

func (r *reportingRepository) GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	query := `
		SELECT
			COALESCE(SUM(CASE WHEN cashflow_usd > 0 THEN cashflow_usd ELSE 0 END), 0) as total_in_usd,
			COALESCE(SUM(CASE WHEN cashflow_usd < 0 THEN ABS(cashflow_usd) ELSE 0 END), 0) as total_out_usd,
			COALESCE(SUM(cashflow_usd), 0) as net_usd,
			COALESCE(SUM(CASE WHEN cashflow_vnd > 0 THEN cashflow_vnd ELSE 0 END), 0) as total_in_vnd,
			COALESCE(SUM(CASE WHEN cashflow_vnd < 0 THEN ABS(cashflow_vnd) ELSE 0 END), 0) as total_out_vnd,
			COALESCE(SUM(cashflow_vnd), 0) as net_vnd
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND (internal_flow IS DISTINCT FROM TRUE)`

	report := &models.CashFlowReport{
		Period: period,
		ByType: make(map[string]*models.CashFlowByType),
		ByTag:  make(map[string]*models.CashFlowByType),
	}

	err = sqlDB.QueryRowContext(ctx, query, period.StartDate, period.EndDate).Scan(
		&report.TotalInUSD, &report.TotalOutUSD, &report.NetUSD,
		&report.TotalInVND, &report.TotalOutVND, &report.NetVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get cash flow totals: %w", err)
	}

	typeQuery := `
		SELECT
			type,
			COALESCE(SUM(CASE WHEN cashflow_usd > 0 THEN cashflow_usd ELSE 0 END), 0) as inflow_usd,
			COALESCE(SUM(CASE WHEN cashflow_usd < 0 THEN ABS(cashflow_usd) ELSE 0 END), 0) as outflow_usd,
			COALESCE(SUM(cashflow_usd), 0) as net_usd,
			COALESCE(SUM(CASE WHEN cashflow_vnd > 0 THEN cashflow_vnd ELSE 0 END), 0) as inflow_vnd,
			COALESCE(SUM(CASE WHEN cashflow_vnd < 0 THEN ABS(cashflow_vnd) ELSE 0 END), 0) as outflow_vnd,
			COALESCE(SUM(cashflow_vnd), 0) as net_vnd,
			COUNT(*) as count
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND (internal_flow IS DISTINCT FROM TRUE)
		GROUP BY type`

	rows, err := sqlDB.QueryContext(ctx, typeQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get cash flow by type: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var txType string
		cf := &models.CashFlowByType{}
		err := rows.Scan(
			&txType, &cf.InflowUSD, &cf.OutflowUSD, &cf.NetUSD,
			&cf.InflowVND, &cf.OutflowVND, &cf.NetVND, &cf.Count,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cash flow by type: %w", err)
		}
		report.ByType[txType] = cf
	}

	var opInUSD, opOutUSD, opNetUSD decimal.Decimal
	var opInVND, opOutVND, opNetVND decimal.Decimal
	for t, cf := range report.ByType {
		if t == "borrow" || t == "repay_borrow" || t == "interest_expense" {
			continue
		}
		opInUSD = opInUSD.Add(cf.InflowUSD)
		opOutUSD = opOutUSD.Add(cf.OutflowUSD)
		opNetUSD = opNetUSD.Add(cf.NetUSD)
		opInVND = opInVND.Add(cf.InflowVND)
		opOutVND = opOutVND.Add(cf.OutflowVND)
		opNetVND = opNetVND.Add(cf.NetVND)
	}

	report.OperatingInUSD = opInUSD
	report.OperatingOutUSD = opOutUSD
	report.OperatingNetUSD = opNetUSD
	report.OperatingInVND = opInVND
	report.OperatingOutVND = opOutVND
	report.OperatingNetVND = opNetVND

	finBorrowQuery := `
		SELECT
			COALESCE(SUM(amount_usd), 0) AS inflow_usd,
			COALESCE(SUM(amount_vnd), 0) AS inflow_vnd
		FROM transactions
		WHERE date >= $1 AND date <= $2 AND type = 'borrow'`

	var finInUSD, finInVND decimal.Decimal
	if err := sqlDB.QueryRowContext(ctx, finBorrowQuery, period.StartDate, period.EndDate).Scan(&finInUSD, &finInVND); err != nil {
		return nil, fmt.Errorf("failed to get financing borrow inflow: %w", err)
	}

	finOutQuery := `
		SELECT
			COALESCE(SUM(ABS(cashflow_usd)), 0) AS outflow_usd,
			COALESCE(SUM(ABS(cashflow_vnd)), 0) AS outflow_vnd
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND type IN ('repay_borrow','interest_expense') AND (internal_flow IS DISTINCT FROM TRUE)`

	var finOutUSD, finOutVND decimal.Decimal
	if err := sqlDB.QueryRowContext(ctx, finOutQuery, period.StartDate, period.EndDate).Scan(&finOutUSD, &finOutVND); err != nil {
		return nil, fmt.Errorf("failed to get financing outflows: %w", err)
	}

	report.FinancingInUSD = finInUSD
	report.FinancingOutUSD = finOutUSD
	report.FinancingNetUSD = finInUSD.Sub(finOutUSD)
	report.FinancingInVND = finInVND
	report.FinancingOutVND = finOutVND
	report.FinancingNetVND = finInVND.Sub(finOutVND)

	report.CombinedInUSD = report.OperatingInUSD.Add(report.FinancingInUSD)
	report.CombinedOutUSD = report.OperatingOutUSD.Add(report.FinancingOutUSD)
	report.CombinedNetUSD = report.OperatingNetUSD.Add(report.FinancingNetUSD)
	report.CombinedInVND = report.OperatingInVND.Add(report.FinancingInVND)
	report.CombinedOutVND = report.OperatingOutVND.Add(report.FinancingOutVND)
	report.CombinedNetVND = report.OperatingNetVND.Add(report.FinancingNetVND)

	tagQuery := `
		SELECT
			COALESCE(tag, 'Untagged') as tag,
			COALESCE(SUM(CASE WHEN cashflow_usd > 0 THEN cashflow_usd ELSE 0 END), 0) as inflow_usd,
			COALESCE(SUM(CASE WHEN cashflow_usd < 0 THEN ABS(cashflow_usd) ELSE 0 END), 0) as outflow_usd,
			COALESCE(SUM(cashflow_usd), 0) as net_usd,
			COALESCE(SUM(CASE WHEN cashflow_vnd > 0 THEN cashflow_vnd ELSE 0 END), 0) as inflow_vnd,
			COALESCE(SUM(CASE WHEN cashflow_vnd < 0 THEN ABS(cashflow_vnd) ELSE 0 END), 0) as outflow_vnd,
			COALESCE(SUM(cashflow_vnd), 0) as net_vnd,
			COUNT(*) as count
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND (internal_flow IS DISTINCT FROM TRUE)
		GROUP BY tag`

	tagRows, err := sqlDB.QueryContext(ctx, tagQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get cash flow by tag: %w", err)
	}
	defer tagRows.Close()

	for tagRows.Next() {
		var tag string
		cf := &models.CashFlowByType{}
		err := tagRows.Scan(
			&tag, &cf.InflowUSD, &cf.OutflowUSD, &cf.NetUSD,
			&cf.InflowVND, &cf.OutflowVND, &cf.NetVND, &cf.Count,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cash flow by tag: %w", err)
		}
		report.ByTag[tag] = cf
	}

	return report, nil
}

func (r *reportingRepository) GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	query := `
		SELECT
			COALESCE(SUM(CASE WHEN cashflow_usd < 0 THEN ABS(cashflow_usd) ELSE 0 END), 0) as total_usd,
			COALESCE(SUM(CASE WHEN cashflow_vnd < 0 THEN ABS(cashflow_vnd) ELSE 0 END), 0) as total_vnd
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND cashflow_usd < 0 AND (internal_flow IS DISTINCT FROM TRUE)`

	report := &models.SpendingReport{
		Period:         period,
		ByTag:          make(map[string]*models.SpendingByTag),
		ByCounterparty: make(map[string]*models.SpendingByTag),
	}

	err = sqlDB.QueryRowContext(ctx, query, period.StartDate, period.EndDate).Scan(
		&report.TotalUSD, &report.TotalVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get spending totals: %w", err)
	}

	tagQuery := `
		SELECT
			COALESCE(tag, 'Untagged') as tag,
			COALESCE(SUM(ABS(cashflow_usd)), 0) as amount_usd,
			COALESCE(SUM(ABS(cashflow_vnd)), 0) as amount_vnd,
			COUNT(*) as count
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND cashflow_usd < 0 AND (internal_flow IS DISTINCT FROM TRUE)
		GROUP BY tag
		ORDER BY amount_usd DESC`

	rows, err := sqlDB.QueryContext(ctx, tagQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get spending by tag: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var tag string
		sp := &models.SpendingByTag{}
		err := rows.Scan(&tag, &sp.AmountUSD, &sp.AmountVND, &sp.Count)
		if err != nil {
			return nil, fmt.Errorf("failed to scan spending by tag: %w", err)
		}

		if !report.TotalUSD.IsZero() {
			sp.Percentage = sp.AmountUSD.Div(report.TotalUSD).Mul(decimal.NewFromInt(100))
		}

		report.ByTag[tag] = sp
	}

	counterpartyQuery := `
		SELECT
			COALESCE(counterparty, 'Unknown') as counterparty,
			COALESCE(SUM(ABS(cashflow_usd)), 0) as amount_usd,
			COALESCE(SUM(ABS(cashflow_vnd)), 0) as amount_vnd,
			COUNT(*) as count
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND cashflow_usd < 0 AND (internal_flow IS DISTINCT FROM TRUE)
		GROUP BY counterparty
		ORDER BY amount_usd DESC`

	cpRows, err := sqlDB.QueryContext(ctx, counterpartyQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get spending by counterparty: %w", err)
	}
	defer cpRows.Close()

	for cpRows.Next() {
		var counterparty string
		sp := &models.SpendingByTag{}
		err := cpRows.Scan(&counterparty, &sp.AmountUSD, &sp.AmountVND, &sp.Count)
		if err != nil {
			return nil, fmt.Errorf("failed to scan spending by counterparty: %w", err)
		}

		if !report.TotalUSD.IsZero() {
			sp.Percentage = sp.AmountUSD.Div(report.TotalUSD).Mul(decimal.NewFromInt(100))
		}

		report.ByCounterparty[counterparty] = sp
	}

	expenseQuery := `
		SELECT id, date, type, asset, account, counterparty, tag,
			   ABS(amount_usd) as amount_usd, ABS(amount_vnd) as amount_vnd, note
		FROM transactions
		WHERE date >= $1 AND date <= $2 AND cashflow_usd < 0
		ORDER BY ABS(amount_usd) DESC
		LIMIT 10`

	expRows, err := sqlDB.QueryContext(ctx, expenseQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get top expenses: %w", err)
	}
	defer expRows.Close()

	for expRows.Next() {
		ts := &models.TransactionSummary{}
		err := expRows.Scan(
			&ts.ID, &ts.Date, &ts.Type, &ts.Asset, &ts.Account,
			&ts.Counterparty, &ts.Tag, &ts.AmountUSD, &ts.AmountVND, &ts.Note,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan top expense: %w", err)
		}
		report.TopExpenses = append(report.TopExpenses, ts)
	}

	return report, nil
}

func (r *reportingRepository) GetOutstandingBorrows(ctx context.Context, asOf time.Time) (map[string]map[string]decimal.Decimal, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	query := `
        WITH sums AS (
            SELECT account, asset,
                   SUM(CASE WHEN type = 'borrow' THEN quantity ELSE 0 END) AS borrowed,
                   SUM(CASE WHEN type = 'repay_borrow' THEN quantity ELSE 0 END) AS repaid
            FROM transactions
            WHERE date <= $1
            GROUP BY account, asset
        )
        SELECT account, asset, borrowed - repaid AS remaining
        FROM sums
        WHERE (borrowed - repaid) > 0`

	rows, err := sqlDB.QueryContext(ctx, query, asOf)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]map[string]decimal.Decimal)
	for rows.Next() {
		var account, asset string
		var remaining decimal.Decimal
		if err := rows.Scan(&account, &asset, &remaining); err != nil {
			return nil, err
		}
		if _, ok := result[account]; !ok {
			result[account] = make(map[string]decimal.Decimal)
		}
		result[account][asset] = remaining
	}
	return result, nil
}

func (r *reportingRepository) GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	report := &models.PnLReport{
		Period:    period,
		ByAsset:   make(map[string]*models.AssetPnL),
		ByAccount: make(map[string]*models.AccountPnL),
	}

	// Enhanced PnL calculation using the investments table for better accuracy
	// This handles multiple deposits per investment and proper cost basis tracking
	realizedQuery := `
        WITH investment_pnl AS (
            SELECT
                i.asset,
                i.account,
                i.pnl as realized_pnl_usd,
                i.pnl * fx.fx_to_vnd as realized_pnl_vnd,
                i.deposit_cost as total_cost_basis,
                i.withdrawal_value as total_withdrawal_value,
                CASE
                    WHEN i.withdrawal_date >= $1 AND i.withdrawal_date <= $2 THEN 1
                    ELSE 0
                END as is_in_period
            FROM investments i
            LEFT JOIN (
                SELECT DISTINCT ON (asset, date)
                    asset, fx_to_vnd, date
                FROM transactions
                WHERE date <= $2
                ORDER BY asset, date DESC
            ) fx ON i.asset = fx.asset AND i.withdrawal_date = fx.date
            WHERE i.is_open = false  -- Only closed investments have realized P&L
            AND i.withdrawal_date IS NOT NULL
        )
        SELECT
            COALESCE(SUM(CASE WHEN is_in_period = 1 THEN realized_pnl_usd ELSE 0 END), 0) as realized_pnl_usd,
            COALESCE(SUM(CASE WHEN is_in_period = 1 THEN realized_pnl_vnd ELSE 0 END), 0) as realized_pnl_vnd,
            COALESCE(SUM(CASE WHEN is_in_period = 1 THEN total_cost_basis ELSE 0 END), 0) as total_cost_basis
        FROM investment_pnl`

	var totalCostBasis decimal.Decimal
	err = sqlDB.QueryRowContext(ctx, realizedQuery, period.StartDate, period.EndDate).Scan(
		&report.RealizedPnLUSD, &report.RealizedPnLVND, &totalCostBasis,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get realized P&L: %w", err)
	}

	// Calculate unrealized P&L from open investments
	unrealizedQuery := `
        WITH latest_prices AS (
            SELECT DISTINCT ON (asset)
                asset,
                amount_usd / NULLIF(quantity, 0) as current_price_usd,
                fx_to_vnd
            FROM transactions
            WHERE quantity > 0 AND date <= $1
            ORDER BY asset, date DESC
        ),
        open_investments AS (
            SELECT
                i.asset,
                i.account,
                (i.deposit_qty - i.withdrawal_qty) as remaining_qty,
                i.deposit_unit_cost,
                COALESCE(p.current_price_usd, i.deposit_unit_cost) as current_price_usd,
                COALESCE(p.fx_to_vnd, 25000) as fx_to_vnd
            FROM investments i
            LEFT JOIN latest_prices p ON i.asset = p.asset
            WHERE i.is_open = true
            AND (i.deposit_qty - i.withdrawal_qty) > 0
        )
        SELECT
            COALESCE(SUM(
                (oi.current_price_usd - oi.deposit_unit_cost) * oi.remaining_qty
            ), 0) as unrealized_pnl_usd,
            COALESCE(SUM(
                (oi.current_price_usd - oi.deposit_unit_cost) * oi.remaining_qty * oi.fx_to_vnd
            ), 0) as unrealized_pnl_vnd
        FROM open_investments oi`

	err = sqlDB.QueryRowContext(ctx, unrealizedQuery, period.EndDate).Scan(
		&report.UnrealizedPnLUSD, &report.UnrealizedPnLVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get unrealized P&L: %w", err)
	}

	report.TotalPnLUSD = report.RealizedPnLUSD.Add(report.UnrealizedPnLUSD)
	report.TotalPnLVND = report.RealizedPnLVND.Add(report.UnrealizedPnLVND)

	// Calculate ROI using total cost basis from all investments (including those still open)
	totalInvestedQuery := `
        SELECT COALESCE(SUM(deposit_cost), 0) as total_invested
        FROM investments
        WHERE deposit_date <= $1`

	var totalInvested decimal.Decimal
	err = sqlDB.QueryRowContext(ctx, totalInvestedQuery, period.EndDate).Scan(&totalInvested)
	if err != nil {
		return nil, fmt.Errorf("failed to get total invested: %w", err)
	}

	// Use the larger of total_cost_basis or total_invested for ROI calculation
	roiBasis := totalCostBasis
	if totalInvested.GreaterThan(totalCostBasis) {
		roiBasis = totalInvested
	}

	if !roiBasis.IsZero() {
		report.ROIPercent = report.TotalPnLUSD.Div(roiBasis).Mul(decimal.NewFromInt(100))
	}

	// Get detailed breakdown by asset
	assetQuery := `
        WITH latest_prices AS (
            SELECT DISTINCT ON (asset)
                asset,
                amount_usd / NULLIF(quantity, 0) as current_price_usd
            FROM transactions
            WHERE quantity > 0 AND date <= $2
            ORDER BY asset, date DESC
        )
        SELECT
            i.asset,
            COALESCE(SUM(CASE WHEN i.is_open = false AND i.withdrawal_date >= $1 AND i.withdrawal_date <= $2 THEN i.pnl ELSE 0 END), 0) as realized_pnl_usd,
            COALESCE(SUM(CASE WHEN i.is_open = true THEN (COALESCE(p.current_price_usd, i.deposit_unit_cost) - i.deposit_unit_cost) * (i.deposit_qty - i.withdrawal_qty) ELSE 0 END), 0) as unrealized_pnl_usd,
            COALESCE(SUM(i.deposit_cost), 0) as total_cost
        FROM investments i
        LEFT JOIN latest_prices p ON i.asset = p.asset
        GROUP BY i.asset`

	assetRows, err := sqlDB.QueryContext(ctx, assetQuery, period.StartDate, period.EndDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get asset breakdown: %w", err)
	}
	defer assetRows.Close()

	for assetRows.Next() {
		var asset string
		var realizedPnL, unrealizedPnL, totalCost decimal.Decimal
		err := assetRows.Scan(&asset, &realizedPnL, &unrealizedPnL, &totalCost)
		if err != nil {
			return nil, fmt.Errorf("failed to scan asset breakdown: %w", err)
		}

		totalPnL := realizedPnL.Add(unrealizedPnL)

		report.ByAsset[asset] = &models.AssetPnL{
			Asset:            asset,
			RealizedPnLUSD:   realizedPnL,
			UnrealizedPnLUSD: unrealizedPnL,
			TotalPnLUSD:      totalPnL,
		}
	}

	return report, nil
}

func (r *reportingRepository) GetExpectedBorrowOutflows(ctx context.Context, asOf time.Time) ([]*models.OutflowProjection, error) {
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}

	query := `
        WITH borrows AS (
            SELECT id, account, asset, date, quantity AS principal,
                   COALESCE(borrow_apr, 0) AS apr,
                   COALESCE(borrow_term_days, 0) AS term_days,
                   COALESCE(borrow_active, TRUE) AS active
            FROM transactions
            WHERE type = 'borrow' AND (borrow_active IS NULL OR borrow_active = TRUE)
        ),
        repayments AS (
            SELECT account, asset, SUM(quantity) AS repaid
            FROM transactions
            WHERE type = 'repay_borrow'
            GROUP BY account, asset
        ),
        agg AS (
            SELECT b.id, b.account, b.asset, b.date, b.principal, b.apr, b.term_days,
                   COALESCE(r.repaid, 0) AS repaid
            FROM borrows b
            LEFT JOIN repayments r ON r.account = b.account AND r.asset = b.asset
        )
        SELECT id, account, asset, date, principal, apr, term_days, repaid
        FROM agg`

	rows, err := sqlDB.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get expected borrow outflows: %w", err)
	}
	defer rows.Close()

	var result []*models.OutflowProjection
	for rows.Next() {
		var (
			id             string
			account, asset string
			start          time.Time
			principal, apr decimal.Decimal
			termDays       int
			repaid         decimal.Decimal
		)
		if err := rows.Scan(&id, &account, &asset, &start, &principal, &apr, &termDays, &repaid); err != nil {
			return nil, err
		}
		remaining := principal.Sub(repaid)
		if remaining.IsNegative() {
			remaining = decimal.Zero
		}
		daysRemaining := 0
		if termDays > 0 {
			end := start.AddDate(0, 0, termDays)
			if asOf.Before(end) {
				daysRemaining = int(end.Sub(asOf).Hours() / 24)
			} else {
				daysRemaining = 0
			}
		}
		interest := decimal.Zero
		if daysRemaining > 0 && !apr.IsZero() && !remaining.IsZero() {
			interest = remaining.Mul(apr).Mul(decimal.NewFromInt(int64(daysRemaining))).Div(decimal.NewFromInt(365))
		}
		total := remaining.Add(interest)
		result = append(result, &models.OutflowProjection{
			ID:                 id,
			Account:            account,
			Asset:              asset,
			RemainingPrincipal: remaining,
			InterestAccrued:    interest,
			TotalOutflow:       total,
			AsOf:               asOf,
		})
	}
	return result, nil
}
