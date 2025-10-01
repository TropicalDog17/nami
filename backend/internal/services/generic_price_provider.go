package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// GenericPriceProvider fetches prices using custom API configurations
type GenericPriceProvider struct {
	httpClient *http.Client
}

// NewGenericPriceProvider creates a new generic price provider
func NewGenericPriceProvider() *GenericPriceProvider {
	return &GenericPriceProvider{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// FetchPrice fetches price using the provided mapping configuration
func (p *GenericPriceProvider) FetchPrice(ctx context.Context, mapping *models.AssetPriceMapping, symbol, currency string, date time.Time) (decimal.Decimal, error) {
	if mapping.APIEndpoint == nil || *mapping.APIEndpoint == "" {
		return decimal.Zero, fmt.Errorf("no API endpoint configured for mapping")
	}

	// Parse API configuration
	var apiConfig models.APIConfiguration
	if mapping.APIConfig != nil {
		if err := json.Unmarshal(*mapping.APIConfig, &apiConfig); err != nil {
			return decimal.Zero, fmt.Errorf("failed to parse API config: %w", err)
		}
	}

	// Build the URL with placeholders replaced
	url := p.buildURL(*mapping.APIEndpoint, mapping.ProviderID, symbol, currency, date, apiConfig.QueryParams)

	// Determine HTTP method
	method := "GET"
	if apiConfig.Method != "" {
		method = strings.ToUpper(apiConfig.Method)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	for key, value := range apiConfig.Headers {
		expandedValue := p.expandEnvVars(value)
		req.Header.Set(key, expandedValue)
	}

	// Add authentication
	if apiConfig.AuthType != "" {
		authValue := p.expandEnvVars(apiConfig.AuthValue)
		switch strings.ToLower(apiConfig.AuthType) {
		case "bearer":
			req.Header.Set("Authorization", "Bearer "+authValue)
		case "apikey":
			req.Header.Set("X-API-Key", authValue)
		}
	}

	// Execute request
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to fetch price: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return decimal.Zero, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var responseData interface{}
	if err := json.NewDecoder(resp.Body).Decode(&responseData); err != nil {
		return decimal.Zero, fmt.Errorf("failed to decode response: %w", err)
	}

	// Extract price using response path
	responsePath := "price" // default
	if mapping.ResponsePath != nil && *mapping.ResponsePath != "" {
		responsePath = *mapping.ResponsePath
	}

	price, err := p.extractPrice(responseData, responsePath, mapping.ProviderID, currency)
	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to extract price: %w", err)
	}

	return price, nil
}

// buildURL replaces placeholders in the URL template
func (p *GenericPriceProvider) buildURL(template, providerID, symbol, currency string, date time.Time, queryParams map[string]string) string {
	url := template

	// Replace common placeholders
	replacements := map[string]string{
		"{symbol}":          symbol,
		"{provider_id}":     providerID,
		"{currency}":        currency,
		"{currency_lower}":  strings.ToLower(currency),
		"{currency_upper}":  strings.ToUpper(currency),
		"{date}":            date.Format("2006-01-02"),
		"{date_yyyymmdd}":   date.Format("20060102"),
		"{date_ddmmyyyy}":   date.Format("02-01-2006"),
		"{date_unix}":       fmt.Sprintf("%d", date.Unix()),
		"{date_yyyy}":       date.Format("2006"),
		"{date_mm}":         date.Format("01"),
		"{date_dd}":         date.Format("02"),
	}

	for placeholder, value := range replacements {
		url = strings.ReplaceAll(url, placeholder, value)
	}

	// Add query parameters
	if len(queryParams) > 0 {
		separator := "?"
		if strings.Contains(url, "?") {
			separator = "&"
		}

		var params []string
		for key, value := range queryParams {
			// Expand placeholders in query param values
			expandedValue := value
			for placeholder, replValue := range replacements {
				expandedValue = strings.ReplaceAll(expandedValue, placeholder, replValue)
			}
			// Expand environment variables
			expandedValue = p.expandEnvVars(expandedValue)
			params = append(params, fmt.Sprintf("%s=%s", key, expandedValue))
		}
		url += separator + strings.Join(params, "&")
	}

	return url
}

// expandEnvVars expands ${VAR_NAME} patterns with environment variables
func (p *GenericPriceProvider) expandEnvVars(s string) string {
	re := regexp.MustCompile(`\$\{([^}]+)\}`)
	return re.ReplaceAllStringFunc(s, func(match string) string {
		varName := match[2 : len(match)-1] // Remove ${ and }
		if value := os.Getenv(varName); value != "" {
			return value
		}
		return match // Keep original if env var not found
	})
}

// extractPrice extracts the price value from the response using a JSON path
func (p *GenericPriceProvider) extractPrice(data interface{}, path, providerID, currency string) (decimal.Decimal, error) {
	// Replace placeholders in path
	path = strings.ReplaceAll(path, "{provider_id}", providerID)
	path = strings.ReplaceAll(path, "{currency}", currency)
	path = strings.ReplaceAll(path, "{currency_lower}", strings.ToLower(currency))
	path = strings.ReplaceAll(path, "{currency_upper}", strings.ToUpper(currency))

	// Navigate the JSON path
	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			var ok bool
			current, ok = v[part]
			if !ok {
				return decimal.Zero, fmt.Errorf("path element '%s' not found in response", part)
			}
		default:
			return decimal.Zero, fmt.Errorf("cannot navigate path '%s' in non-object type", part)
		}
	}

	// Convert to decimal
	switch v := current.(type) {
	case float64:
		return decimal.NewFromFloat(v), nil
	case int:
		return decimal.NewFromInt(int64(v)), nil
	case int64:
		return decimal.NewFromInt(v), nil
	case string:
		return decimal.NewFromString(v)
	default:
		return decimal.Zero, fmt.Errorf("price value is not a number: %T", current)
	}
}

// GetHistoricalDaily implements PriceProvider interface (requires mapping context)
func (p *GenericPriceProvider) GetHistoricalDaily(ctx context.Context, symbol string, currency string, date time.Time) (decimal.Decimal, error) {
	return decimal.Zero, fmt.Errorf("GenericPriceProvider requires mapping configuration, use FetchPrice instead")
}

// GetLatest implements PriceProvider interface (requires mapping context)
func (p *GenericPriceProvider) GetLatest(ctx context.Context, symbol string, currency string) (decimal.Decimal, error) {
	return decimal.Zero, fmt.Errorf("GenericPriceProvider requires mapping configuration, use FetchPrice instead")
}

