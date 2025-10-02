package repositories

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// TransactionRepository defines the interface for transaction data operations
type TransactionRepository interface {
	Create(ctx context.Context, tx *models.Transaction) error
	CreateBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error)
	GetByID(ctx context.Context, id string) (*models.Transaction, error)
	List(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error)
	GetCount(ctx context.Context, filter *models.TransactionFilter) (int, error)
	Update(ctx context.Context, tx *models.Transaction) error
	Delete(ctx context.Context, id string) error
	DeleteActionGroup(ctx context.Context, id string) (int, error)
	RecalculateFX(ctx context.Context, onlyMissing bool) (int, error)
	RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error)
}

// InvestmentRepository defines the interface for investment data operations
type InvestmentRepository interface {
	Create(ctx context.Context, investment *models.Investment) error
	GetByID(ctx context.Context, id string) (*models.Investment, error)
	GetByAssetAccount(ctx context.Context, asset, account string, isOpen *bool) ([]*models.Investment, error)
	List(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error)
	GetCount(ctx context.Context, filter *models.InvestmentFilter) (int, error)
	Update(ctx context.Context, investment *models.Investment) error
	Delete(ctx context.Context, id string) error
	GetSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error)
	FindByDepositID(ctx context.Context, depositID string) (*models.Investment, error)

	// Stake-specific methods
	CreateFromStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error)
	FindOpenInvestmentForStake(ctx context.Context, asset, account, horizon string) (*models.Investment, error)
	UpdateWithStake(ctx context.Context, investment *models.Investment, stakeTx *models.Transaction) error
	UpdateWithUnstake(ctx context.Context, investment *models.Investment, unstakeTx *models.Transaction) error
}

// ReportingRepository defines the interface for reporting data operations
type ReportingRepository interface {
	GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error)
	GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error)
	GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error)
	GetOutstandingBorrows(ctx context.Context, asOf time.Time) (map[string]map[string]decimal.Decimal, error)
	GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error)
	GetExpectedBorrowOutflows(ctx context.Context, asOf time.Time) ([]*models.OutflowProjection, error)
}