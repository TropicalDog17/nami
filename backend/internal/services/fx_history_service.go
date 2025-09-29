package services

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// FXHistoryServiceImpl implements FXHistoryService using an FXProvider and FXCacheService
type FXHistoryServiceImpl struct {
	provider FXProvider
	cache    FXCacheService
}

func NewFXHistoryService(provider FXProvider, cache FXCacheService) FXHistoryService {
	return &FXHistoryServiceImpl{provider: provider, cache: cache}
}

func (s *FXHistoryServiceImpl) GetDaily(ctx context.Context, from, to string, date time.Time) (*models.FXRate, error) {
	// normalize to date-only in UTC
	d := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

	if s.cache != nil {
		if cached, err := s.cache.GetCachedRate(ctx, from, to, d); err == nil && cached != nil {
			return cached, nil
		}
	}

	rate, err := s.provider.GetRate(ctx, from, to, d)
	if err != nil {
		return nil, err
	}

	fx := &models.FXRate{
		FromCurrency: from,
		ToCurrency:   to,
		Rate:         rate,
		Date:         d,
		Source:       "exchangerate-api.com",
		CreatedAt:    time.Now(),
	}
	if s.cache != nil {
		// Persist the rate; if this fails, surface the error to the caller
		if err := s.cache.CacheRate(ctx, fx); err != nil {
			return nil, err
		}
	}
	return fx, nil
}

func (s *FXHistoryServiceImpl) GetRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error) {
	// inclusive range, day step
	rates := make([]*models.FXRate, 0)
	for d := dateOnly(start); !d.After(dateOnly(end)); d = d.AddDate(0, 0, 1) {
		r, err := s.GetDaily(ctx, from, to, d)
		if err != nil {
			return nil, err
		}
		rates = append(rates, r)
	}
	return rates, nil
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// compile-time checks
var _ FXHistoryService = (*FXHistoryServiceImpl)(nil)
var _ decimal.Decimal // keep import if unused in some builds

// ListExistingRange returns only existing DB records (no fetching)
func (s *FXHistoryServiceImpl) ListExistingRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error) {
	if s.cache == nil {
		return []*models.FXRate{}, nil
	}
	sStart := dateOnly(start)
	sEnd := dateOnly(end)
	return s.cache.ListRatesRange(ctx, from, to, sStart, sEnd)
}
