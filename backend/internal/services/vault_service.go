package services

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// VaultService defines the interface for vault operations
type VaultService interface {
	CreateVault(ctx context.Context, vault *models.Vault) (*models.Vault, error)
	GetVaultByID(ctx context.Context, id string) (*models.Vault, error)
	GetVaults(ctx context.Context, filter *models.VaultFilter) ([]*models.Vault, error)
	UpdateVault(ctx context.Context, vault *models.Vault) error
	DeleteVault(ctx context.Context, id string) error
	GetVaultSummary(ctx context.Context, filter *models.VaultFilter) (*models.VaultSummary, error)
}

// VaultShareService defines the interface for vault share operations
type VaultShareService interface {
	CreateVaultShare(ctx context.Context, share *models.VaultShare) (*models.VaultShare, error)
	GetVaultShareByID(ctx context.Context, id string) (*models.VaultShare, error)
	GetVaultShares(ctx context.Context, filter *models.VaultShareFilter) ([]*models.VaultShare, error)
	UpdateVaultShare(ctx context.Context, share *models.VaultShare) error
	DeleteVaultShare(ctx context.Context, id string) error
	GetUserVaultShares(ctx context.Context, userID string) ([]*models.VaultShare, error)
	MintShares(ctx context.Context, vaultID, userID string, shares, costPerShare decimal.Decimal) (*models.VaultShare, error)
	BurnShares(ctx context.Context, vaultID, userID string, shares, marketValuePerShare decimal.Decimal) (*models.VaultShare, error)
	GetShareHistory(ctx context.Context, vaultID, userID string) ([]*models.VaultShareHistory, error)
}

// VaultAssetService defines the interface for vault asset operations
type VaultAssetService interface {
	CreateVaultAsset(ctx context.Context, asset *models.VaultAsset) (*models.VaultAsset, error)
	GetVaultAssetByID(ctx context.Context, id string) (*models.VaultAsset, error)
	GetAssets(ctx context.Context, filter *models.VaultAssetFilter) ([]*models.VaultAsset, error)
	UpdateVaultAsset(ctx context.Context, asset *models.VaultAsset) error
	DeleteVaultAsset(ctx context.Context, id string) error
	GetVaultAssets(ctx context.Context, vaultID string) ([]*models.VaultAsset, error)
	UpdateAssetPrices(ctx context.Context, vaultID string, prices map[string]decimal.Decimal) error
	GetAssetSummary(ctx context.Context, vaultID string) (*models.VaultAssetSummary, error)
	RebalanceAssets(ctx context.Context, vaultID string) error
}

// VaultTransactionService defines the interface for vault transaction operations
type VaultTransactionService interface {
	CreateTransaction(ctx context.Context, tx *models.VaultTransaction) (*models.VaultTransaction, error)
	GetTransactionByID(ctx context.Context, id string) (*models.VaultTransaction, error)
	GetTransactions(ctx context.Context, filter *models.VaultTransactionFilter) ([]*models.VaultTransaction, error)
	UpdateTransaction(ctx context.Context, tx *models.VaultTransaction) error
	DeleteTransaction(ctx context.Context, id string) error
	GetVaultTransactions(ctx context.Context, vaultID string) ([]*models.VaultTransaction, error)
	GetUserTransactions(ctx context.Context, userID string) ([]*models.VaultTransaction, error)
	GetTransactionSummary(ctx context.Context, filter *models.VaultTransactionFilter) (*models.VaultTransactionSummary, error)
	ProcessDeposit(ctx context.Context, vaultID, userID string, amount decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error)
	ProcessWithdrawal(ctx context.Context, vaultID, userID string, amount decimal.Decimal) (*models.VaultTransaction, *models.VaultShare, error)
}

// VaultPerformanceService defines the interface for vault performance tracking
type VaultPerformanceService interface {
	CreatePerformanceRecord(ctx context.Context, performance *models.VaultPerformance) (*models.VaultPerformance, error)
	GetPerformanceByPeriod(ctx context.Context, vaultID, period string) ([]*models.VaultPerformance, error)
	UpdatePerformanceMetrics(ctx context.Context, vaultID string) error
	CalculateVaultReturns(ctx context.Context, vaultID string, startDate, endDate time.Time) (decimal.Decimal, error)
	GetAnnualizedReturns(ctx context.Context, vaultID string) (decimal.Decimal, error)
}