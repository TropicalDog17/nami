package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// HTTPFXProvider provides exchange rates from external HTTP APIs
type HTTPFXProvider struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
	cache      FXCacheService
}

// normalizeCurrencyForAPI maps currencies that the upstream API does not support
// as a base into an equivalent supported currency. For example, most fiat FX
// providers do not accept stablecoins (USDT/USDC) as a base currency even though
// they are expected to trade 1:1 with USD. In those cases we map them to USD.
func normalizeCurrencyForAPI(symbol string) string {
	s := strings.ToUpper(symbol)
	if s == "USDT" || s == "USDC" {
		return "USD"
	}
	return s
}

// ExchangeRateResponse represents the API response structure
type ExchangeRateResponse struct {
	Result          string                     `json:"result"`
	BaseCode        string                     `json:"base_code"`
	ConversionRates map[string]decimal.Decimal `json:"conversion_rates"`
}

// NewHTTPFXProvider creates a new HTTP FX provider
// Uses exchangerate-api.com as the default provider (free tier available)
func NewHTTPFXProvider(apiKey string, cache FXCacheService) FXProvider {
	baseURL := "https://api.exchangerate-api.com/v4/latest"
	if apiKey != "" {
		baseURL = "https://v6.exchangerate-api.com/v6/" + apiKey + "/latest"
	}

	return &HTTPFXProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache: cache,
	}
}

// GetRate retrieves exchange rate from one currency to another
func (p *HTTPFXProvider) GetRate(ctx context.Context, from, to string, date time.Time) (decimal.Decimal, error) {
	// Check cache first
	if p.cache != nil {
		if cachedRate, err := p.cache.GetCachedRate(ctx, from, to, date); err == nil && cachedRate != nil {
			return cachedRate.Rate, nil
		}
	}

	// Fetch from API
	rate, err := p.fetchRateFromAPI(ctx, from, to)
	if err != nil {

		return decimal.Zero, err
	}

	// Cache the result
	if p.cache != nil {
		cacheRate := &models.FXRate{
			FromCurrency: strings.ToUpper(from),
			ToCurrency:   strings.ToUpper(to),
			Rate:         rate,
			Date:         date,
			Source:       "exchangerate-api.com",
			CreatedAt:    time.Now(),
		}
		// Don't fail if caching fails; CacheRate will populate ID/CreatedAt on success
		_ = p.cache.CacheRate(ctx, cacheRate)
	}

	return rate, nil
}

// GetRates retrieves multiple exchange rates from base currency to targets
func (p *HTTPFXProvider) GetRates(ctx context.Context, base string, targets []string, date time.Time) (map[string]decimal.Decimal, error) {
	rates := make(map[string]decimal.Decimal)

	// Check cache for all rates
	var uncachedTargets []string
	if p.cache != nil {
		cachedRates, err := p.cache.GetCachedRates(ctx, base, targets, date)
		if err == nil {
			for _, target := range targets {
				if cachedRate, exists := cachedRates[target]; exists {
					rates[target] = cachedRate.Rate
				} else {
					uncachedTargets = append(uncachedTargets, target)
				}
			}
		} else {
			uncachedTargets = targets
		}
	} else {
		uncachedTargets = targets
	}

	// Fetch uncached rates
	if len(uncachedTargets) > 0 {
		apiRates, err := p.fetchRatesFromAPI(ctx, base, uncachedTargets)
		if err != nil {
			return nil, err
		} else {
			// Merge API rates and cache them
			for target, rate := range apiRates {
				rates[target] = rate

				// Cache the rate
				if p.cache != nil {
					cacheRate := &models.FXRate{
						FromCurrency: strings.ToUpper(base),
						ToCurrency:   strings.ToUpper(target),
						Rate:         rate,
						Date:         date,
						Source:       "exchangerate-api.com",
						CreatedAt:    time.Now(),
					}
					_ = p.cache.CacheRate(ctx, cacheRate)
				}
			}
		}
	}

	return rates, nil
}

// GetLatestRates retrieves latest exchange rates
func (p *HTTPFXProvider) GetLatestRates(ctx context.Context, base string, targets []string) (map[string]decimal.Decimal, error) {
	return p.GetRates(ctx, base, targets, time.Now())
}

// IsSupported checks if currency pair is supported
func (p *HTTPFXProvider) IsSupported(from, to string) bool {
	// Most major currencies are supported, for now return true
	// In a production system, you'd maintain a list of supported currencies
	supportedCurrencies := map[string]bool{
		"USD": true, "EUR": true, "GBP": true, "JPY": true, "VND": true,
		"BTC": true, "ETH": true, "USDT": true, "USDC": true,
	}

	return supportedCurrencies[strings.ToUpper(from)] && supportedCurrencies[strings.ToUpper(to)]
}

// GetSupportedCurrencies returns list of supported currencies
func (p *HTTPFXProvider) GetSupportedCurrencies() []string {
	return []string{"USD", "EUR", "GBP", "JPY", "VND", "BTC", "ETH", "USDT", "USDC"}
}

// fetchRateFromAPI fetches a single exchange rate from the API
func (p *HTTPFXProvider) fetchRateFromAPI(ctx context.Context, from, to string) (decimal.Decimal, error) {
	rates, err := p.fetchRatesFromAPI(ctx, from, []string{to})
	if err != nil {
		return decimal.Zero, err
	}

	if rate, exists := rates[to]; exists {
		return rate, nil
	}

	return decimal.Zero, fmt.Errorf("rate not found for %s to %s", from, to)
}

// fetchRatesFromAPI fetches multiple exchange rates from the API
func (p *HTTPFXProvider) fetchRatesFromAPI(ctx context.Context, base string, targets []string) (map[string]decimal.Decimal, error) {
	normalizedBase := normalizeCurrencyForAPI(base)
	url := fmt.Sprintf("%s/%s", p.baseURL, normalizedBase)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch rates: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	// Decode generically to support both v6 (conversion_rates) and v4 (rates)
	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Optional result field check; treat missing as success
	if r, ok := raw["result"].(string); ok && r != "success" {
		return nil, fmt.Errorf("API error: %s", r)
	}

	// Extract rates from either conversion_rates or rates
	var ratesMap map[string]interface{}
	if cr, ok := raw["conversion_rates"].(map[string]interface{}); ok {
		ratesMap = cr
	} else if rr, ok := raw["rates"].(map[string]interface{}); ok {
		ratesMap = rr
	} else {
		return nil, fmt.Errorf("API response missing rates")
	}

	result := make(map[string]decimal.Decimal)
	for _, target := range targets {
		targetUpper := strings.ToUpper(target)
		normalizedTarget := normalizeCurrencyForAPI(targetUpper)
		if v, exists := ratesMap[normalizedTarget]; exists {
			switch t := v.(type) {
			case float64:
				result[target] = decimal.NewFromFloat(t)
			case json.Number:
				if f, err := t.Float64(); err == nil {
					result[target] = decimal.NewFromFloat(f)
				}
			default:
				// ignore non-numeric
			}
		}
	}

	return result, nil
}
