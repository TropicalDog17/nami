package models

import (
    "errors"
    "time"

    "github.com/shopspring/decimal"
)

// AssetPrice represents a cached historical price for an asset in a currency
type AssetPrice struct {
    ID        int             `json:"id" db:"id"`
    Symbol    string          `json:"symbol" db:"symbol"`
    Currency  string          `json:"currency" db:"currency"`
    Price     decimal.Decimal `json:"price" db:"price"`
    Date      time.Time       `json:"date" db:"date"`
    Source    string          `json:"source" db:"source"`
    CreatedAt time.Time       `json:"created_at" db:"created_at"`
}

func (p *AssetPrice) Validate() error {
    if p.Symbol == "" {
        return errors.New("symbol is required")
    }
    if p.Currency == "" {
        return errors.New("currency is required")
    }
    if p.Price.IsZero() || p.Price.IsNegative() {
        return errors.New("price must be positive")
    }
    if p.Date.IsZero() {
        return errors.New("date is required")
    }
    if p.Source == "" {
        return errors.New("source is required")
    }
    return nil
}


