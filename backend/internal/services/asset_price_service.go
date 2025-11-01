package services

import (
    "context"
    "fmt"
    "time"

    "github.com/tropicaldog17/nami/internal/models"
)

type AssetPriceServiceImpl struct {
    provider PriceProvider
    cache    PriceCacheService
}

func NewAssetPriceService(provider PriceProvider, cache PriceCacheService) AssetPriceService {
    return &AssetPriceServiceImpl{provider: provider, cache: cache}
}

func (s *AssetPriceServiceImpl) GetDaily(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
    d := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
    if s.cache != nil {
        if cached, err := s.cache.GetCachedPrice(ctx, symbol, currency, d); err == nil && cached != nil {
            return cached, nil
        }
    }
    price, err := s.provider.GetHistoricalDaily(ctx, symbol, currency, d)
    if err != nil {
        return nil, err
    }
    ap := &models.AssetPrice{
        Symbol:    symbol,
        Currency:  currency,
        Price:     price,
        Date:      d,
        Source:    "coingecko",
        CreatedAt: time.Now(),
    }
    if s.cache != nil {
        _ = s.cache.CachePrice(ctx, ap)
    }
    return ap, nil
}

func (s *AssetPriceServiceImpl) GetRange(ctx context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error) {
    prices := make([]*models.AssetPrice, 0)
    for d := dateOnly(start); !d.After(dateOnly(end)); d = d.AddDate(0, 0, 1) {
        ap, err := s.GetDaily(ctx, symbol, currency, d)
        if err != nil {
            return nil, err
        }
        prices = append(prices, ap)
    }
    return prices, nil
}

// GetLatest fetches the latest spot price and returns it as an AssetPrice with second-level timestamp
func (s *AssetPriceServiceImpl) GetLatest(ctx context.Context, symbol, currency string) (*models.AssetPrice, error) {
    if s.provider == nil {
        return nil, fmt.Errorf("no price provider configured")
    }
    price, err := s.provider.GetLatest(ctx, symbol, currency)
    if err != nil {
        return nil, err
    }
    now := time.Now().UTC().Truncate(time.Second)
    ap := &models.AssetPrice{
        Symbol:    symbol,
        Currency:  currency,
        Price:     price,
        Date:      now,
        Source:    "coingecko",
        CreatedAt: now,
    }
    return ap, nil
}


