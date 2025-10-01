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
	// CreateTransactionsBatch creates multiple transactions atomically and optionally links them with a link type.
	// When linkType is non-empty and 2+ transactions are provided, links are inserted in a star topology
	// from the first transaction to all others using table `transaction_links`.
	CreateTransactionsBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error)
	GetTransaction(ctx context.Context, id string) (*models.Transaction, error)
	ListTransactions(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error)
	UpdateTransaction(ctx context.Context, tx *models.Transaction) error
	DeleteTransaction(ctx context.Context, id string) error
	// DeleteActionGroup deletes all transactions linked together by link_type = 'action' that are associated with the
	// same group as the provided transaction id. Deletion is performed atomically in a single SQL transaction.
	DeleteActionGroup(ctx context.Context, oneID string) (int, error)
	GetTransactionCount(ctx context.Context, filter *models.TransactionFilter) (int, error)
	// RecalculateFX recalculates FX and derived amounts for existing rows.
	// If onlyMissing is true, only rows with missing/zero FX are updated; otherwise all rows.
	RecalculateFX(ctx context.Context, onlyMissing bool) (int, error)
	// RecalculateOneFX recalculates FX and derived amounts for a single transaction by ID
	RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error)
	// ExportTransactions returns all transactions as JSON-serializable slice
	ExportTransactions(ctx context.Context) ([]*models.Transaction, error)
	// ImportTransactions creates or updates transactions from a dump; upsert by id when present
	ImportTransactions(ctx context.Context, txs []*models.Transaction, upsert bool) (int, error)
}

// LinkService establishes logical links between related transactions (e.g., stake-unstake, borrow-repay)
type LinkService interface {
	CreateLink(ctx context.Context, link *models.TransactionLink) error
	GetLinked(ctx context.Context, txID string) ([]*models.TransactionLink, error)
}

// ReportingService defines the interface for reporting operations
type ReportingService interface {
	GetHoldings(ctx context.Context, asOf time.Time) ([]*models.Holding, error)
	GetCashFlow(ctx context.Context, period models.Period) (*models.CashFlowReport, error)
	GetSpending(ctx context.Context, period models.Period) (*models.SpendingReport, error)
	GetPnL(ctx context.Context, period models.Period) (*models.PnLReport, error)
	GetHoldingsByAccount(ctx context.Context, asOf time.Time) (map[string][]*models.Holding, error)
	GetHoldingsByAsset(ctx context.Context, asOf time.Time) (map[string]*models.Holding, error)
	GetOutstandingBorrows(ctx context.Context, asOf time.Time) (map[string]map[string]decimal.Decimal, error)
	GetExpectedBorrowOutflows(ctx context.Context, asOf time.Time) ([]*models.OutflowProjection, error)
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

	// Asset price mappings
	CreateAssetPriceMapping(ctx context.Context, mapping *models.AssetPriceMapping) error

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
	// ListRatesRange returns only existing rates in DB for a date range (no fetching)
	ListRatesRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error)
}

// PriceProvider defines interface for asset prices (e.g., crypto)
type PriceProvider interface {
	// GetHistoricalDaily returns price for a date (UTC, daily granularity)
	GetHistoricalDaily(ctx context.Context, symbol string, currency string, date time.Time) (decimal.Decimal, error)
	// GetLatest returns latest price
	GetLatest(ctx context.Context, symbol string, currency string) (decimal.Decimal, error)
}

// PriceCacheService caches asset prices
type PriceCacheService interface {
	GetCachedPrice(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error)
	CachePrice(ctx context.Context, price *models.AssetPrice) error
}

// FXHistoryService supports backfilling and retrieving historical USD/VND
type FXHistoryService interface {
	// GetDaily ensures a rate exists (cache or fetch) for a given date
	GetDaily(ctx context.Context, from, to string, date time.Time) (*models.FXRate, error)
	// GetRange returns daily rates inclusive between start and end; fetch-and-cache if missing
	GetRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error)
	// ListExistingRange returns only records that already exist in DB (no fetching)
	ListExistingRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error)
}

// AssetPriceService provides historical/latest prices and conversion helpers
type AssetPriceService interface {
	GetDaily(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error)
	GetRange(ctx context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error)
}

// InvestmentService defines the interface for investment tracking operations
type InvestmentService interface {
	GetInvestments(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error)
	GetInvestmentByID(ctx context.Context, depositID string) (*models.Investment, error)
	GetInvestmentSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error)
	GetWithdrawalsForDeposit(ctx context.Context, depositID string) ([]*models.Transaction, error)
	GetAvailableDeposits(ctx context.Context, asset, account string) ([]*models.Investment, error)
	CreateDeposit(ctx context.Context, tx *models.Transaction) (*models.Investment, error)
	CreateWithdrawal(ctx context.Context, tx *models.Transaction) (*models.Investment, error)
}
