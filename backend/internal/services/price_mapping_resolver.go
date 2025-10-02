package services

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// PriceMappingResolver resolves asset to provider mapping
type PriceMappingResolver interface {
	ResolveByAssetID(ctx context.Context, assetID int) (*models.AssetPriceMapping, error)
	ResolveBySymbol(ctx context.Context, symbol string) (*models.AssetPriceMapping, error)
}

type PriceMappingResolverImpl struct {
	db *db.DB
}

func NewPriceMappingResolver(database *db.DB) PriceMappingResolver {
	return &PriceMappingResolverImpl{db: database}
}

// getSQLDB returns the underlying *sql.DB for complex queries
func (r *PriceMappingResolverImpl) getSQLDB() (*sql.DB, error) {
	return r.db.GetSQLDB()
}

func (r *PriceMappingResolverImpl) ResolveByAssetID(ctx context.Context, assetID int) (*models.AssetPriceMapping, error) {
	query := `SELECT id, asset_id, provider, provider_id, quote_currency, is_popular, created_at
              FROM asset_price_mappings WHERE asset_id = $1 ORDER BY id ASC LIMIT 1`
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}
	m := &models.AssetPriceMapping{}
	err = sqlDB.QueryRowContext(ctx, query, assetID).Scan(&m.ID, &m.AssetID, &m.Provider, &m.ProviderID, &m.QuoteCurrency, &m.IsPopular, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to resolve mapping: %w", err)
	}
	return m, nil
}

func (r *PriceMappingResolverImpl) ResolveBySymbol(ctx context.Context, symbol string) (*models.AssetPriceMapping, error) {
	query := `SELECT m.id, m.asset_id, m.provider, m.provider_id, m.quote_currency, m.is_popular, m.created_at
              FROM asset_price_mappings m
              JOIN assets a ON a.id = m.asset_id
              WHERE a.symbol = $1
              ORDER BY m.id ASC LIMIT 1`
	sqlDB, err := r.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}
	m := &models.AssetPriceMapping{}
	err = sqlDB.QueryRowContext(ctx, query, symbol).Scan(&m.ID, &m.AssetID, &m.Provider, &m.ProviderID, &m.QuoteCurrency, &m.IsPopular, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to resolve mapping by symbol: %w", err)
	}
	return m, nil
}
