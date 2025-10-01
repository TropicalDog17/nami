package services

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

type reportingService struct {
	db *db.DB
}

// NewReportingService creates a new reporting service
func NewReportingService(database *db.DB) ReportingService {
	return &reportingService{db: database}
}

// GetHoldings retrieves current asset holdings
func (s *reportingService) GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error) {
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

	rows, err := s.db.QueryContext(ctx, query, asOf)
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

	return holdings, nil
}

// GetCashFlow retrieves cash flow analysis for a period
func (s *reportingService) GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error) {
	// Main cash flow totals
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

	err := s.db.QueryRowContext(ctx, query, period.StartDate, period.EndDate).Scan(
		&report.TotalInUSD, &report.TotalOutUSD, &report.NetUSD,
		&report.TotalInVND, &report.TotalOutVND, &report.NetVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get cash flow totals: %w", err)
	}

	// Cash flow by type
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

	rows, err := s.db.QueryContext(ctx, typeQuery, period.StartDate, period.EndDate)
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

	// Derive Operating totals from ByType (exclude financing types)
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

	// Compute Financing directly to include borrow as inflow even if cashflow is zero
	finBorrowQuery := `
		SELECT 
			COALESCE(SUM(amount_usd), 0) AS inflow_usd,
			COALESCE(SUM(amount_vnd), 0) AS inflow_vnd
		FROM transactions
		WHERE date >= $1 AND date <= $2 AND type = 'borrow'`

	var finInUSD, finInVND decimal.Decimal
	if err := s.db.QueryRowContext(ctx, finBorrowQuery, period.StartDate, period.EndDate).Scan(&finInUSD, &finInVND); err != nil {
		return nil, fmt.Errorf("failed to get financing borrow inflow: %w", err)
	}

	finOutQuery := `
		SELECT 
			COALESCE(SUM(ABS(cashflow_usd)), 0) AS outflow_usd,
			COALESCE(SUM(ABS(cashflow_vnd)), 0) AS outflow_vnd
		FROM transactions
			WHERE date >= $1 AND date <= $2 AND type IN ('repay_borrow','interest_expense') AND (internal_flow IS DISTINCT FROM TRUE)`

	var finOutUSD, finOutVND decimal.Decimal
	if err := s.db.QueryRowContext(ctx, finOutQuery, period.StartDate, period.EndDate).Scan(&finOutUSD, &finOutVND); err != nil {
		return nil, fmt.Errorf("failed to get financing outflows: %w", err)
	}

	report.FinancingInUSD = finInUSD
	report.FinancingOutUSD = finOutUSD
	report.FinancingNetUSD = finInUSD.Sub(finOutUSD)
	report.FinancingInVND = finInVND
	report.FinancingOutVND = finOutVND
	report.FinancingNetVND = finInVND.Sub(finOutVND)

	// Combined is operating + financing
	report.CombinedInUSD = report.OperatingInUSD.Add(report.FinancingInUSD)
	report.CombinedOutUSD = report.OperatingOutUSD.Add(report.FinancingOutUSD)
	report.CombinedNetUSD = report.OperatingNetUSD.Add(report.FinancingNetUSD)
	report.CombinedInVND = report.OperatingInVND.Add(report.FinancingInVND)
	report.CombinedOutVND = report.OperatingOutVND.Add(report.FinancingOutVND)
	report.CombinedNetVND = report.OperatingNetVND.Add(report.FinancingNetVND)

	// Cash flow by tag (where tag is not null)
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

	tagRows, err := s.db.QueryContext(ctx, tagQuery, period.StartDate, period.EndDate)
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

// GetSpending retrieves spending analysis for a period
func (s *reportingService) GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error) {
	// Total spending (negative cash flows only)
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

	err := s.db.QueryRowContext(ctx, query, period.StartDate, period.EndDate).Scan(
		&report.TotalUSD, &report.TotalVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get spending totals: %w", err)
	}

	// Spending by tag
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

	rows, err := s.db.QueryContext(ctx, tagQuery, period.StartDate, period.EndDate)
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

		// Calculate percentage
		if !report.TotalUSD.IsZero() {
			sp.Percentage = sp.AmountUSD.Div(report.TotalUSD).Mul(decimal.NewFromInt(100))
		}

		report.ByTag[tag] = sp
	}

	// Spending by counterparty
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

	cpRows, err := s.db.QueryContext(ctx, counterpartyQuery, period.StartDate, period.EndDate)
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

		// Calculate percentage
		if !report.TotalUSD.IsZero() {
			sp.Percentage = sp.AmountUSD.Div(report.TotalUSD).Mul(decimal.NewFromInt(100))
		}

		report.ByCounterparty[counterparty] = sp
	}

	// Top expenses
	expenseQuery := `
		SELECT id, date, type, asset, account, counterparty, tag, 
			   ABS(amount_usd) as amount_usd, ABS(amount_vnd) as amount_vnd, note
		FROM transactions 
		WHERE date >= $1 AND date <= $2 AND cashflow_usd < 0
		ORDER BY ABS(amount_usd) DESC
		LIMIT 10`

	expRows, err := s.db.QueryContext(ctx, expenseQuery, period.StartDate, period.EndDate)
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

// GetOutstandingBorrows returns current open borrows by asset/account with remaining amounts (borrow minus linked repays)
func (s *reportingService) GetOutstandingBorrows(ctx context.Context, asOf time.Time) (map[string]map[string]decimal.Decimal, error) {
	// Sum borrows and subtract repays linked via transaction_links
	// Fallback heuristic without links: treat type borrow positive, repay_borrow negative grouped by account+asset
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

	rows, err := s.db.QueryContext(ctx, query, asOf)
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

// GetPnL retrieves profit and loss analysis for a period
func (s *reportingService) GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error) {
	report := &models.PnLReport{
		Period:    period,
		ByAsset:   make(map[string]*models.AssetPnL),
		ByAccount: make(map[string]*models.AccountPnL),
	}

	// For now, we'll calculate a simplified P&L based on realized gains/losses
	// This is a basic implementation - in a real system you'd want more sophisticated P&L calculation

	// Get realized P&L from sales/disposals and stake-unstake pairs (linked deposit->withdraw)
	realizedQuery := `
        WITH sell_disposal AS (
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('sell', 'disposal') THEN amount_usd ELSE 0 END), 0) as usd,
                COALESCE(SUM(CASE WHEN type IN ('sell', 'disposal') THEN amount_vnd ELSE 0 END), 0) as vnd
            FROM transactions 
            WHERE date >= $1 AND date <= $2
        ),
        stake_pairs AS (
            SELECT l.from_tx AS deposit_id, l.to_tx AS withdraw_id
            FROM transaction_links l
            WHERE l.link_type = 'stake_unstake'
        ),
        dep AS (
            SELECT id, amount_usd, amount_vnd, quantity
            FROM transactions
        ),
        wit AS (
            SELECT id, date, amount_usd, amount_vnd, quantity
            FROM transactions
        ),
        stake_unstake AS (
            SELECT 
                COALESCE(SUM(
                    -- USD realized PnL = withdraw USD - withdraw_qty * entry_unit_usd
                    w.amount_usd - (w.quantity * (d.amount_usd / NULLIF(d.quantity, 0)))
                ), 0) AS usd,
                COALESCE(SUM(
                    -- VND realized PnL = withdraw VND - withdraw_qty * entry_unit_vnd
                    w.amount_vnd - (w.quantity * (d.amount_vnd / NULLIF(d.quantity, 0)))
                ), 0) AS vnd
            FROM stake_pairs p
            JOIN dep d ON d.id = p.deposit_id
            JOIN wit w ON w.id = p.withdraw_id
            WHERE w.date >= $1 AND w.date <= $2
        )
        SELECT 
            COALESCE(sd.usd, 0) + COALESCE(su.usd, 0) AS realized_pnl_usd,
            COALESCE(sd.vnd, 0) + COALESCE(su.vnd, 0) AS realized_pnl_vnd
        FROM sell_disposal sd
        CROSS JOIN stake_unstake su`

	err := s.db.QueryRowContext(ctx, realizedQuery, period.StartDate, period.EndDate).Scan(
		&report.RealizedPnLUSD, &report.RealizedPnLVND,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get realized P&L: %w", err)
	}

	// For unrealized P&L, we'd need current market prices which we don't have yet
	// So we'll set it to zero for now
	report.UnrealizedPnLUSD = decimal.Zero
	report.UnrealizedPnLVND = decimal.Zero

	report.TotalPnLUSD = report.RealizedPnLUSD.Add(report.UnrealizedPnLUSD)
	report.TotalPnLVND = report.RealizedPnLVND.Add(report.UnrealizedPnLVND)

	// Calculate simple ROI based on total invested vs current value
	totalInvestedQuery := `
		SELECT COALESCE(SUM(ABS(amount_usd)), 1) 
		FROM transactions 
		WHERE date >= $1 AND date <= $2 AND type IN ('buy', 'purchase')`

	var totalInvested decimal.Decimal
	err = s.db.QueryRowContext(ctx, totalInvestedQuery, period.StartDate, period.EndDate).Scan(&totalInvested)
	if err != nil {
		return nil, fmt.Errorf("failed to get total invested: %w", err)
	}

	if !totalInvested.IsZero() {
		report.ROIPercent = report.TotalPnLUSD.Div(totalInvested).Mul(decimal.NewFromInt(100))
	}

	return report, nil
}

// GetHoldingsByAccount retrieves holdings grouped by account
func (s *reportingService) GetHoldingsByAccount(ctx context.Context, asOf time.Time) (map[string][]*models.Holding, error) {
	holdings, err := s.GetHoldings(ctx, asOf)
	if err != nil {
		return nil, err
	}

	result := make(map[string][]*models.Holding)
	for _, holding := range holdings {
		result[holding.Account] = append(result[holding.Account], holding)
	}

	return result, nil
}

// GetHoldingsByAsset retrieves holdings grouped by asset
func (s *reportingService) GetHoldingsByAsset(ctx context.Context, asOf time.Time) (map[string]*models.Holding, error) {
	holdings, err := s.GetHoldings(ctx, asOf)
	if err != nil {
		return nil, err
	}

	result := make(map[string]*models.Holding)
	for _, holding := range holdings {
		if existing, exists := result[holding.Asset]; exists {
			// Aggregate quantities and values
			existing.Quantity = existing.Quantity.Add(holding.Quantity)
			existing.ValueUSD = existing.ValueUSD.Add(holding.ValueUSD)
			existing.ValueVND = existing.ValueVND.Add(holding.ValueVND)
			if holding.LastUpdated.After(existing.LastUpdated) {
				existing.LastUpdated = holding.LastUpdated
			}
		} else {
			// Create a copy for aggregation
			result[holding.Asset] = &models.Holding{
				Asset:       holding.Asset,
				Account:     "All Accounts", // Aggregated view
				Quantity:    holding.Quantity,
				ValueUSD:    holding.ValueUSD,
				ValueVND:    holding.ValueVND,
				LastUpdated: holding.LastUpdated,
			}
		}
	}

	return result, nil
}

// GetExpectedBorrowOutflows returns projected principal+interest outflows for active borrows as of a date
func (s *reportingService) GetExpectedBorrowOutflows(ctx context.Context, asOf time.Time) ([]*models.OutflowProjection, error) {
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

	rows, err := s.db.QueryContext(ctx, query)
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
