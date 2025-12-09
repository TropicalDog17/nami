package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

type PriceCacheServiceImpl struct {
	db *db.DB
}

func NewPriceCacheService(database *db.DB) PriceCacheService {
	return &PriceCacheServiceImpl{db: database}
}

// getSQLDB returns the underlying *sql.DB for complex queries
func (s *PriceCacheServiceImpl) getSQLDB() (*sql.DB, error) {
	return s.db.GetSQLDB()
}

func (s *PriceCacheServiceImpl) GetCachedPrice(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
	query := `
        SELECT id, symbol, currency, price, date, source, created_at
        FROM asset_prices
        WHERE symbol = $1 AND currency = $2 AND date = $3
        ORDER BY created_at DESC
        LIMIT 1`

	sqlDB, err := s.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}
	p := &models.AssetPrice{}
	err = sqlDB.QueryRowContext(ctx, query, symbol, currency, date).Scan(
		&p.ID, &p.Symbol, &p.Currency, &p.Price, &p.Date, &p.Source, &p.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cached price: %w", err)
	}
	return p, nil
}

func (s *PriceCacheServiceImpl) CachePrice(ctx context.Context, price *models.AssetPrice) error {
	query := `
        INSERT INTO asset_prices (symbol, currency, price, date, source)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (symbol, currency, date, source)
        DO UPDATE SET price = EXCLUDED.price, created_at = NOW()`

	sqlDB, err := s.getSQLDB()
	if err != nil {
		return fmt.Errorf("failed to get SQL DB: %w", err)
	}
	_, err = sqlDB.ExecContext(ctx, query, price.Symbol, price.Currency, price.Price, price.Date, price.Source)
	if err != nil {
		return fmt.Errorf("failed to cache price: %w", err)
	}
	return nil
}
