package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// FXCacheServiceImpl implements FXCacheService
type FXCacheServiceImpl struct {
	db *db.DB
}

// NewFXCacheService creates a new FX cache service
func NewFXCacheService(database *db.DB) FXCacheService {
	return &FXCacheServiceImpl{db: database}
}

// GetCachedRate retrieves a cached exchange rate
func (s *FXCacheServiceImpl) GetCachedRate(ctx context.Context, from, to string, date time.Time) (*models.FXRate, error) {
	query := `
		SELECT id, from_currency, to_currency, rate, date, source, created_at
		FROM fx_rates
		WHERE from_currency = $1 AND to_currency = $2 AND date = $3
		ORDER BY created_at DESC
		LIMIT 1`

	rate := &models.FXRate{}
	err := s.db.QueryRowContext(ctx, query, from, to, date).Scan(
		&rate.ID, &rate.FromCurrency, &rate.ToCurrency,
		&rate.Rate, &rate.Date, &rate.Source, &rate.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil // No cached rate found
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cached rate: %w", err)
	}

	return rate, nil
}

// CacheRate stores an exchange rate in the cache
func (s *FXCacheServiceImpl) CacheRate(ctx context.Context, rate *models.FXRate) error {
	query := `
		INSERT INTO fx_rates (from_currency, to_currency, rate, date, source)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (from_currency, to_currency, date, source)
		DO UPDATE SET
			rate = EXCLUDED.rate,
			created_at = NOW()`

	_, err := s.db.ExecContext(ctx, query,
		rate.FromCurrency, rate.ToCurrency, rate.Rate, rate.Date, rate.Source)

	if err != nil {
		return fmt.Errorf("failed to cache rate: %w", err)
	}

	return nil
}

// GetCachedRates retrieves multiple cached exchange rates
func (s *FXCacheServiceImpl) GetCachedRates(ctx context.Context, from string, targets []string, date time.Time) (map[string]*models.FXRate, error) {
	if len(targets) == 0 {
		return make(map[string]*models.FXRate), nil
	}

	// Build query with IN clause for targets
	query := `
		SELECT DISTINCT ON (to_currency)
			id, from_currency, to_currency, rate, date, source, created_at
		FROM fx_rates
		WHERE from_currency = $1 AND date = $2 AND to_currency = ANY($3)
		ORDER BY to_currency, created_at DESC`

	// Convert targets to PostgreSQL array format
	rows, err := s.db.QueryContext(ctx, query, from, date, fmt.Sprintf("{%s}", joinStrings(targets, ",")))
	if err != nil {
		return nil, fmt.Errorf("failed to get cached rates: %w", err)
	}
	defer rows.Close()

	rates := make(map[string]*models.FXRate)
	for rows.Next() {
		rate := &models.FXRate{}
		err := rows.Scan(
			&rate.ID, &rate.FromCurrency, &rate.ToCurrency,
			&rate.Rate, &rate.Date, &rate.Source, &rate.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cached rate: %w", err)
		}
		rates[rate.ToCurrency] = rate
	}

	return rates, nil
}

// InvalidateCache removes cached rates for a specific currency pair and date
func (s *FXCacheServiceImpl) InvalidateCache(ctx context.Context, from, to string, date time.Time) error {
	query := `DELETE FROM fx_rates WHERE from_currency = $1 AND to_currency = $2 AND date = $3`

	_, err := s.db.ExecContext(ctx, query, from, to, date)
	if err != nil {
		return fmt.Errorf("failed to invalidate cache: %w", err)
	}

	return nil
}

// Helper function to join strings
func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	if len(strs) == 1 {
		return strs[0]
	}

	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
