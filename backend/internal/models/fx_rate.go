package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// FXRate represents a foreign exchange rate
type FXRate struct {
	ID           int             `json:"id" db:"id"`
	FromCurrency string          `json:"from_currency" db:"from_currency"`
	ToCurrency   string          `json:"to_currency" db:"to_currency"`
	Rate         decimal.Decimal `json:"rate" db:"rate"`
	Date         time.Time       `json:"date" db:"date"`
	Source       string          `json:"source" db:"source"`
	CreatedAt    time.Time       `json:"created_at" db:"created_at"`
}

// FXRateRequest represents a request for FX rates
type FXRateRequest struct {
	FromCurrency string
	ToCurrency   string
	Date         time.Time
}

// FXRateResponse represents a response containing FX rates
type FXRateResponse struct {
	Rates     map[string]decimal.Decimal `json:"rates"`
	Base      string                     `json:"base"`
	Date      time.Time                  `json:"date"`
	Source    string                     `json:"source"`
	Timestamp time.Time                  `json:"timestamp"`
}

// Common FX sources
const (
	FXSourceMock         = "mock"
	FXSourceExchangeRate = "exchangerate-api"
	FXSourceFixer        = "fixer"
	FXSourceManual       = "manual"
)

// Common currencies
const (
	CurrencyUSD = "USD"
	CurrencyVND = "VND"
	CurrencyEUR = "EUR"
	CurrencyBTC = "BTC"
	CurrencyETH = "ETH"
)

// Validate validates the FX rate data
func (fx *FXRate) Validate() error {
	if fx.FromCurrency == "" {
		return errors.New("from_currency is required")
	}
	if fx.ToCurrency == "" {
		return errors.New("to_currency is required")
	}
	if fx.FromCurrency == fx.ToCurrency {
		return errors.New("from_currency and to_currency must be different")
	}
	if fx.Rate.IsZero() || fx.Rate.IsNegative() {
		return errors.New("rate must be positive")
	}
	if fx.Date.IsZero() {
		return errors.New("date is required")
	}
	if fx.Source == "" {
		return errors.New("source is required")
	}
	return nil
}

// IsValidSource checks if the FX source is valid
func IsValidSource(source string) bool {
	validSources := []string{
		FXSourceMock,
		FXSourceExchangeRate,
		FXSourceFixer,
		FXSourceManual,
	}

	for _, validSource := range validSources {
		if source == validSource {
			return true
		}
	}
	return false
}

// GetInverseRate calculates the inverse rate (1/rate)
func (fx *FXRate) GetInverseRate() decimal.Decimal {
	if fx.Rate.IsZero() {
		return decimal.Zero
	}
	return decimal.NewFromInt(1).Div(fx.Rate)
}

// IsCryptocurrency checks if a currency is a cryptocurrency
func IsCryptocurrency(currency string) bool {
	cryptos := []string{
		// Major Cryptocurrencies
		"BTC", "ETH",
		// Stablecoins
		"USDT", "USDC", "DAI", "BUSD",
		// Commodity-backed Tokens
		"PAXG", "XAU",
		// Layer 1 Blockchains
		"SOL", "ADA", "AVAX", "DOT", "MATIC", "ATOM", "NEAR", "ALGO",
		// DeFi & Exchange Tokens
		"BNB", "UNI", "LINK", "AAVE", "CRV", "SUSHI",
		// Other Popular Tokens
		"XRP", "LTC", "DOGE", "SHIB", "APT", "ARB", "OP",
	}
	for _, crypto := range cryptos {
		if currency == crypto {
			return true
		}
	}
	return false
}

// IsFiatCurrency checks if a currency is a fiat currency
func IsFiatCurrency(currency string) bool {
	fiats := []string{"USD", "VND", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"}
	for _, fiat := range fiats {
		if currency == fiat {
			return true
		}
	}
	return false
}
