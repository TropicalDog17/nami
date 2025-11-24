package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

func TestHTTPFXProvider_GetRate(t *testing.T) {
	// Create a test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Mock response for USD to EUR
		response := map[string]interface{}{
			"result":    "success",
			"base_code": "USD",
			"rates": map[string]interface{}{
				"EUR": 0.85,
				"VND": 24000.0,
			},
		}

		json.NewEncoder(w).Encode(response)
	}))
	defer ts.Close()

	// Create provider with test URL
	provider := &HTTPFXProvider{
		baseURL:    ts.URL,
		httpClient: &http.Client{},
		cache:      nil,
	}

	// Test GetRate
	rate, err := provider.GetRate(context.Background(), "USD", "EUR", time.Now())
	if err != nil {
		t.Fatalf("GetRate failed: %v", err)
	}

	expectedRate := decimal.NewFromFloat(0.85)
	if !rate.Equal(expectedRate) {
		t.Errorf("Expected rate %s, got %s", expectedRate.String(), rate.String())
	}

	// Test VND rate
	vndRate, err := provider.GetRate(context.Background(), "USD", "VND", time.Now())
	if err != nil {
		t.Fatalf("GetRate VND failed: %v", err)
	}

	expectedVndRate := decimal.NewFromFloat(24000)
	if !vndRate.Equal(expectedVndRate) {
		t.Errorf("Expected VND rate %s, got %s", expectedVndRate.String(), vndRate.String())
	}
}

func TestHTTPFXProvider_GetRates(t *testing.T) {
	// Create a test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Mock response for multiple currencies
		response := map[string]interface{}{
			"result":    "success",
			"base_code": "USD",
			"rates": map[string]interface{}{
				"EUR": 0.85,
				"GBP": 0.75,
				"VND": 24000.0,
				"JPY": 110.0,
			},
		}

		json.NewEncoder(w).Encode(response)
	}))
	defer ts.Close()

	// Create provider with test URL
	provider := &HTTPFXProvider{
		baseURL:    ts.URL,
		httpClient: &http.Client{},
		cache:      nil,
	}

	// Test GetRates
	targets := []string{"EUR", "GBP", "VND"}
	rates, err := provider.GetRates(context.Background(), "USD", targets, time.Now())
	if err != nil {
		t.Fatalf("GetRates failed: %v", err)
	}

	// Validate each rate
	expectedRates := map[string]decimal.Decimal{
		"EUR": decimal.NewFromFloat(0.85),
		"GBP": decimal.NewFromFloat(0.75),
		"VND": decimal.NewFromFloat(24000),
	}

	for target, expected := range expectedRates {
		actual, exists := rates[target]
		if !exists {
			t.Errorf("Missing rate for %s", target)
			continue
		}

		if !actual.Equal(expected) {
			t.Errorf("Expected %s rate %s, got %s", target, expected.String(), actual.String())
		}
	}
}

func TestHTTPFXProvider_NormalizeCurrencyForAPI(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"USDT", "USD"},
		{"USDC", "USD"},
		{"USD", "USD"},
		{"EUR", "EUR"},
		{"btc", "BTC"}, // Test case insensitive
		{"eth", "ETH"},
	}

	for _, test := range tests {
		result := normalizeCurrencyForAPI(test.input)
		if result != test.expected {
			t.Errorf("normalizeCurrencyForAPI(%s) = %s, expected %s", test.input, result, test.expected)
		}
	}
}

func TestHTTPFXProvider_IsSupported(t *testing.T) {
	provider := &HTTPFXProvider{}

	tests := []struct {
		from     string
		to       string
		expected bool
	}{
		{"USD", "EUR", true},
		{"BTC", "VND", true},
		{"USDT", "USD", true}, // Should normalize USDT to USD and be supported
		{"XYZ", "ABC", false}, // Unsupported currencies
		{"", "USD", false},    // Empty currency
	}

	for _, test := range tests {
		result := provider.IsSupported(test.from, test.to)
		if result != test.expected {
			t.Errorf("IsSupported(%s, %s) = %v, expected %v", test.from, test.to, result, test.expected)
		}
	}
}

func TestHTTPFXProvider_GetSupportedCurrencies(t *testing.T) {
	provider := &HTTPFXProvider{}
	currencies := provider.GetSupportedCurrencies()

	expectedCurrencies := []string{"USD", "EUR", "GBP", "JPY", "VND", "BTC", "ETH", "USDT", "USDC"}

	if len(currencies) != len(expectedCurrencies) {
		t.Errorf("Expected %d currencies, got %d", len(expectedCurrencies), len(currencies))
	}

	for _, expected := range expectedCurrencies {
		found := false
		for _, actual := range currencies {
			if actual == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Missing expected currency: %s", expected)
		}
	}
}

// Test with FX cache
func TestHTTPFXProvider_WithCache(t *testing.T) {
	// Create a test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Only respond successfully once, then we'll test caching
		response := map[string]interface{}{
			"result":    "success",
			"base_code": "USD",
			"rates": map[string]interface{}{
				"EUR": 0.85,
				"VND": 24000.0,
			},
		}

		json.NewEncoder(w).Encode(response)
	}))
	defer ts.Close()

	// Create mock cache
	mockCache := &MockFXCache{
		cachedRates: make(map[string]*models.FXRate),
	}

	// Create provider with cache
	provider := &HTTPFXProvider{
		baseURL:    ts.URL,
		httpClient: &http.Client{},
		cache:      mockCache,
	}

	ctx := context.Background()
	date := time.Now()

	// First call should hit the API
	rate1, err := provider.GetRate(ctx, "USD", "EUR", date)
	if err != nil {
		t.Fatalf("First GetRate failed: %v", err)
	}

	// Second call should use cache
	rate2, err := provider.GetRate(ctx, "USD", "EUR", date)
	if err != nil {
		t.Fatalf("Second GetRate failed: %v", err)
	}

	if !rate1.Equal(rate2) {
		t.Errorf("Rates should be equal: %s vs %s", rate1.String(), rate2.String())
	}

	// Verify cache was used
	if len(mockCache.cachedRates) == 0 {
		t.Error("Expected cache to be populated")
	}
}

// MockFXCache for testing
type MockFXCache struct {
	cachedRates map[string]*models.FXRate
}

func (m *MockFXCache) GetCachedRate(ctx context.Context, from, to string, date time.Time) (*models.FXRate, error) {
	key := from + "_" + to + "_" + date.Format("2006-01-02")
	if rate, exists := m.cachedRates[key]; exists {
		return rate, nil
	}
	return nil, fmt.Errorf("not found")
}

func (m *MockFXCache) GetCachedRates(ctx context.Context, base string, targets []string, date time.Time) (map[string]*models.FXRate, error) {
	result := make(map[string]*models.FXRate)
	for _, target := range targets {
		key := base + "_" + target + "_" + date.Format("2006-01-02")
		if rate, exists := m.cachedRates[key]; exists {
			result[target] = rate
		}
	}
	return result, nil
}

func (m *MockFXCache) CacheRate(ctx context.Context, rate *models.FXRate) error {
	key := rate.FromCurrency + "_" + rate.ToCurrency + "_" + rate.Date.Format("2006-01-02")
	m.cachedRates[key] = rate
	return nil
}

func (m *MockFXCache) InvalidateCache(ctx context.Context, from, to string, date time.Time) error {
	key := from + "_" + to + "_" + date.Format("2006-01-02")
	delete(m.cachedRates, key)
	return nil
}

func (m *MockFXCache) ListRatesRange(ctx context.Context, from, to string, start, end time.Time) ([]*models.FXRate, error) {
	var rates []*models.FXRate
	for _, rate := range m.cachedRates {
		if rate.FromCurrency == from && rate.ToCurrency == to &&
			(rate.Date.Equal(start) || rate.Date.Equal(end) || (rate.Date.After(start) && rate.Date.Before(end))) {
			rates = append(rates, rate)
		}
	}
	return rates, nil
}
