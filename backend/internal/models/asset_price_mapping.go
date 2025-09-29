package models

import "time"

type AssetPriceMapping struct {
	ID            int       `json:"id" db:"id"`
	AssetID       int       `json:"asset_id" db:"asset_id"`
	Provider      string    `json:"provider" db:"provider"`
	ProviderID    string    `json:"provider_id" db:"provider_id"`
	QuoteCurrency string    `json:"quote_currency" db:"quote_currency"`
	IsPopular     bool      `json:"is_popular" db:"is_popular"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}
