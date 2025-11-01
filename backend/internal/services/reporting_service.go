package services

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
)

type reportingService struct {
	reportRepo repositories.ReportingRepository
}

// NewReportingService creates a new reporting service
func NewReportingService(database *db.DB) ReportingService {
	return &reportingService{reportRepo: repositories.NewReportingRepository(database)}
}

// GetHoldings retrieves current holdings and includes open investment (vault) holdings.
// Percentages are computed over the combined set based on USD value.
func (s *reportingService) GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error) {
    // Base holdings from transactions view
    baseHoldings, err := s.reportRepo.GetHoldings(ctx, asOf)
    if err != nil {
        return nil, err
    }

    // Vault holdings (open investments) labeled as "asset (vault)"
    vaultHoldings, err := s.reportRepo.GetOpenInvestmentHoldings(ctx, asOf)
    if err != nil {
        return nil, err
    }

    // Combine both sets
    all := append([]*models.Holding{}, baseHoldings...)
    all = append(all, vaultHoldings...)

    // Compute portfolio percentages
    var totalUSD decimal.Decimal
    for _, h := range all {
        totalUSD = totalUSD.Add(h.ValueUSD)
    }
    if !totalUSD.IsZero() {
        for _, h := range all {
            h.Percentage = h.ValueUSD.Div(totalUSD).Mul(decimal.NewFromInt(100))
        }
    }

    return all, nil
}

// GetCashFlow retrieves cash flow analysis for a period
func (s *reportingService) GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error) {
	return s.reportRepo.GetCashFlow(ctx, period)
}

// GetSpending retrieves spending analysis for a period
func (s *reportingService) GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error) {
	return s.reportRepo.GetSpending(ctx, period)
}

// GetOutstandingBorrows returns current open borrows by asset/account with remaining amounts (borrow minus linked repays)
func (s *reportingService) GetOutstandingBorrows(ctx context.Context, asOf time.Time) (map[string]map[string]decimal.Decimal, error) {
	return s.reportRepo.GetOutstandingBorrows(ctx, asOf)
}

// GetPnL retrieves profit and loss analysis for a period
func (s *reportingService) GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error) {
	return s.reportRepo.GetPnL(ctx, period)
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
    // Use combined holdings (transactions + open investments)
    all, err := s.GetHoldings(ctx, asOf)
    if err != nil {
        return nil, err
    }

    // Aggregate by asset label
    result := make(map[string]*models.Holding)
    for _, holding := range all {
        if existing, exists := result[holding.Asset]; exists {
            existing.Quantity = existing.Quantity.Add(holding.Quantity)
            existing.ValueUSD = existing.ValueUSD.Add(holding.ValueUSD)
            existing.ValueVND = existing.ValueVND.Add(holding.ValueVND)
            if holding.LastUpdated.After(existing.LastUpdated) {
                existing.LastUpdated = holding.LastUpdated
            }
        } else {
            result[holding.Asset] = &models.Holding{
                Asset:       holding.Asset,
                Account:     "All Accounts",
                Quantity:    holding.Quantity,
                ValueUSD:    holding.ValueUSD,
                ValueVND:    holding.ValueVND,
                LastUpdated: holding.LastUpdated,
            }
        }
    }

    // Calculate percentages for aggregated holdings
    var totalValueUSD decimal.Decimal
    for _, holding := range result {
        totalValueUSD = totalValueUSD.Add(holding.ValueUSD)
    }
    if !totalValueUSD.IsZero() {
        for _, holding := range result {
            holding.Percentage = holding.ValueUSD.Div(totalValueUSD).Mul(decimal.NewFromInt(100))
        }
    }

    return result, nil
}

// GetExpectedBorrowOutflows returns projected principal+interest outflows for active borrows as of a date
func (s *reportingService) GetExpectedBorrowOutflows(ctx context.Context, asOf time.Time) ([]*models.OutflowProjection, error) {
	return s.reportRepo.GetExpectedBorrowOutflows(ctx, asOf)
}
