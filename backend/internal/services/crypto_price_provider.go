package services

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "strings"
    "time"

    "github.com/shopspring/decimal"
)

// CoinGecko-based implementation (no API key required for basic endpoints)
type CoinGeckoPriceProvider struct {
    httpClient *http.Client
}

func NewCoinGeckoPriceProvider() PriceProvider {
    return &CoinGeckoPriceProvider{httpClient: &http.Client{Timeout: 10 * time.Second}}
}

func (p *CoinGeckoPriceProvider) GetHistoricalDaily(ctx context.Context, symbol string, currency string, date time.Time) (decimal.Decimal, error) {
    // CoinGecko requires coin ID; map common symbols to IDs
    id := mapSymbolToCoinGeckoID(symbol)
    if id == "" {
        return decimal.Zero, fmt.Errorf("unsupported symbol: %s", symbol)
    }
    // CoinGecko historical endpoint expects dd-mm-yyyy
    d := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
    url := fmt.Sprintf("https://api.coingecko.com/api/v3/coins/%s/history?date=%02d-%02d-%d&localization=false", id, d.Day(), d.Month(), d.Year())

    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return decimal.Zero, err
    }

    resp, err := p.httpClient.Do(req)
    if err != nil {
        return decimal.Zero, err
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        return decimal.Zero, fmt.Errorf("coingecko status %d", resp.StatusCode)
    }

    var payload struct {
        MarketData struct {
            CurrentPrice map[string]float64 `json:"current_price"`
        } `json:"market_data"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
        return decimal.Zero, err
    }
    val, ok := payload.MarketData.CurrentPrice[strings.ToLower(currency)]
    if !ok {
        return decimal.Zero, fmt.Errorf("price not found for currency %s", currency)
    }
    return decimal.NewFromFloat(val), nil
}

func (p *CoinGeckoPriceProvider) GetLatest(ctx context.Context, symbol string, currency string) (decimal.Decimal, error) {
    id := mapSymbolToCoinGeckoID(symbol)
    if id == "" {
        return decimal.Zero, fmt.Errorf("unsupported symbol: %s", symbol)
    }
    url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=%s", id, strings.ToLower(currency))
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return decimal.Zero, err
    }
    resp, err := p.httpClient.Do(req)
    if err != nil {
        return decimal.Zero, err
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        return decimal.Zero, fmt.Errorf("coingecko status %d", resp.StatusCode)
    }
    var payload map[string]map[string]float64
    if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
        return decimal.Zero, err
    }
    m, ok := payload[id]
    if !ok {
        return decimal.Zero, fmt.Errorf("id not found in response")
    }
    v, ok := m[strings.ToLower(currency)]
    if !ok {
        return decimal.Zero, fmt.Errorf("currency not found in response")
    }
    return decimal.NewFromFloat(v), nil
}

func mapSymbolToCoinGeckoID(symbol string) string {
    switch strings.ToUpper(symbol) {
    case "BTC":
        return "bitcoin"
    case "ETH":
        return "ethereum"
    case "USDT":
        return "tether"
    case "USDC":
        return "usd-coin"
    default:
        return ""
    }
}


