package services

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// TransactionService defines the interface for transaction operations
type TransactionService interface {
	CreateTransaction(ctx context.Context, tx *models.Transaction) error
	GetTransaction(ctx context.Context, id string) (*models.Transaction, error)
	ListTransactions(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error)
	UpdateTransaction(ctx context.Context, tx *models.Transaction) error
	DeleteTransaction(ctx context.Context, id string) error
	GetTransactionCount(ctx context.Context, filter *models.TransactionFilter) (int, error)
}

// ReportingService defines the interface for reporting operations
type ReportingService interface {
	GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error)
	GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error)
	GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error)
	GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error)
	GetHoldingsByAccount(ctx context.Context, asOf time.Time) (map[string][]*models.Holding, error)
	GetHoldingsByAsset(ctx context.Context, asOf time.Time) (map[string]*models.Holding, error)
}

// AdminService defines the interface for admin operations
type AdminService interface {
	// Transaction Types
	ListTransactionTypes(ctx context.Context) ([]*models.TransactionType, error)
	GetTransactionType(ctx context.Context, id int) (*models.TransactionType, error)
	CreateTransactionType(ctx context.Context, tt *models.TransactionType, changedBy string) error
	UpdateTransactionType(ctx context.Context, tt *models.TransactionType, changedBy string) error
	DeleteTransactionType(ctx context.Context, id int, changedBy string) error
	GetTypeAuditTrail(ctx context.Context, typeID int) ([]*models.TransactionTypeAudit, error)

	// Accounts
	ListAccounts(ctx context.Context) ([]*models.Account, error)
	GetAccount(ctx context.Context, id int) (*models.Account, error)
	CreateAccount(ctx context.Context, account *models.Account) error
	UpdateAccount(ctx context.Context, account *models.Account) error
	DeleteAccount(ctx context.Context, id int) error

	// Assets
	ListAssets(ctx context.Context) ([]*models.Asset, error)
	GetAsset(ctx context.Context, id int) (*models.Asset, error)
	CreateAsset(ctx context.Context, asset *models.Asset) error
	UpdateAsset(ctx context.Context, asset *models.Asset) error
	DeleteAsset(ctx context.Context, id int) error

	// Tags
	ListTags(ctx context.Context) ([]*models.Tag, error)
	GetTag(ctx context.Context, id int) (*models.Tag, error)
	CreateTag(ctx context.Context, tag *models.Tag) error
	UpdateTag(ctx context.Context, tag *models.Tag) error
	DeleteTag(ctx context.Context, id int) error
}

// FXProvider defines the interface for foreign exchange rate providers
type FXProvider interface {
	GetRate(ctx context.Context, from, to string, date time.Time) (decimal.Decimal, error)
	GetRates(ctx context.Context, base string, targets []string, date time.Time) (map[string]decimal.Decimal, error)
	GetLatestRates(ctx context.Context, base string, targets []string) (map[string]decimal.Decimal, error)
	IsSupported(from, to string) bool
	GetSupportedCurrencies() []string
}

// FXCacheService defines the interface for FX rate caching
type FXCacheService interface {
	GetCachedRate(ctx context.Context, from, to string, date time.Time) (*models.FXRate, error)
	CacheRate(ctx context.Context, rate *models.FXRate) error
	GetCachedRates(ctx context.Context, from string, targets []string, date time.Time) (map[string]*models.FXRate, error)
	InvalidateCache(ctx context.Context, from, to string, date time.Time) error
}
