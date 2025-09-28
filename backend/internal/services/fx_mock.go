package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// MockFXProvider provides mock exchange rates for testing and development
type MockFXProvider struct {
	rates map[string]decimal.Decimal
}

// NewMockFXProvider creates a new mock FX provider with hardcoded rates
func NewMockFXProvider() FXProvider {
	return &MockFXProvider{
		rates: map[string]decimal.Decimal{
			// USD as base
			"USD:VND": decimal.NewFromFloat(24000.0),
			"USD:EUR": decimal.NewFromFloat(0.85),
			"USD:GBP": decimal.NewFromFloat(0.75),

			// VND as base
			"VND:USD": decimal.NewFromFloat(1.0 / 24000.0),
			"VND:EUR": decimal.NewFromFloat(0.85 / 24000.0),

			// BTC rates (conservative values to fit DECIMAL constraints)
			"BTC:USD": decimal.NewFromFloat(50000.0),   // Reduced from 65000
			"BTC:VND": decimal.NewFromFloat(1200000.0), // 1.2M, fits in DECIMAL(12,2)
			"USD:BTC": decimal.NewFromFloat(1.0 / 50000.0),
			"VND:BTC": decimal.NewFromFloat(1.0 / 1200000.0),

			// ETH rates (adjusted to fit DECIMAL(12,2) constraint)
			"ETH:USD": decimal.NewFromFloat(2500.0),
			"ETH:VND": decimal.NewFromFloat(60000.0), // 60K instead of 60M, fits in DECIMAL(12,2)
			"USD:ETH": decimal.NewFromFloat(1.0 / 2500.0),
			"VND:ETH": decimal.NewFromFloat(1.0 / 60000.0),

			// USDT (assume 1:1 with USD)
			"USDT:USD": decimal.NewFromFloat(1.0),
			"USDT:VND": decimal.NewFromFloat(24000.0),
			"USD:USDT": decimal.NewFromFloat(1.0),
			"VND:USDT": decimal.NewFromFloat(1.0 / 24000.0),

			// Same currency rates
			"USD:USD":   decimal.NewFromFloat(1.0),
			"VND:VND":   decimal.NewFromFloat(1.0),
			"BTC:BTC":   decimal.NewFromFloat(1.0),
			"ETH:ETH":   decimal.NewFromFloat(1.0),
			"USDT:USDT": decimal.NewFromFloat(1.0),
		},
	}
}

// GetRate retrieves exchange rate from one currency to another
func (p *MockFXProvider) GetRate(ctx context.Context, from, to string, date time.Time) (decimal.Decimal, error) {
	if from == to {
		return decimal.NewFromFloat(1.0), nil
	}

	key := strings.ToUpper(from) + ":" + strings.ToUpper(to)
	if rate, exists := p.rates[key]; exists {
		// Return rate without variation for now to avoid overflow
		return rate, nil
	}

	// Try reverse rate
	reverseKey := strings.ToUpper(to) + ":" + strings.ToUpper(from)
	if reverseRate, exists := p.rates[reverseKey]; exists {
		if reverseRate.IsZero() {
			return decimal.Zero, fmt.Errorf("invalid reverse rate for %s:%s", to, from)
		}
		return decimal.NewFromFloat(1.0).Div(reverseRate), nil
	}

	return decimal.Zero, fmt.Errorf("exchange rate not available for %s to %s", from, to)
}

// GetRates retrieves multiple exchange rates from base currency to targets
func (p *MockFXProvider) GetRates(ctx context.Context, base string, targets []string, date time.Time) (map[string]decimal.Decimal, error) {
	rates := make(map[string]decimal.Decimal)

	for _, target := range targets {
		rate, err := p.GetRate(ctx, base, target, date)
		if err != nil {
			return nil, fmt.Errorf("failed to get rate %s:%s: %w", base, target, err)
		}
		rates[target] = rate
	}

	return rates, nil
}

// GetLatestRates retrieves latest exchange rates (same as GetRates for mock)
func (p *MockFXProvider) GetLatestRates(ctx context.Context, base string, targets []string) (map[string]decimal.Decimal, error) {
	return p.GetRates(ctx, base, targets, time.Now())
}

// IsSupported checks if currency pair is supported
func (p *MockFXProvider) IsSupported(from, to string) bool {
	if from == to {
		return true
	}

	key := strings.ToUpper(from) + ":" + strings.ToUpper(to)
	reverseKey := strings.ToUpper(to) + ":" + strings.ToUpper(from)

	_, hasRate := p.rates[key]
	_, hasReverse := p.rates[reverseKey]

	return hasRate || hasReverse
}

// GetSupportedCurrencies returns list of supported currencies
func (p *MockFXProvider) GetSupportedCurrencies() []string {
	currencies := make(map[string]bool)

	for key := range p.rates {
		parts := strings.Split(key, ":")
		if len(parts) == 2 {
			currencies[parts[0]] = true
			currencies[parts[1]] = true
		}
	}

	result := make([]string, 0, len(currencies))
	for currency := range currencies {
		result = append(result, currency)
	}

	return result
}
