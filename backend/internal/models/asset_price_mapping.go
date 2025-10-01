package models

import (
	"encoding/json"
	"time"
)

type AssetPriceMapping struct {
	ID            int       `json:"id" db:"id"`
	AssetID       int       `json:"asset_id" db:"asset_id"`
	Provider      string    `json:"provider" db:"provider"`
	ProviderID    string    `json:"provider_id" db:"provider_id"`
	QuoteCurrency string    `json:"quote_currency" db:"quote_currency"`
	IsPopular     bool      `json:"is_popular" db:"is_popular"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`

	// Flexible price provider configuration
	APIEndpoint       *string          `json:"api_endpoint,omitempty" db:"api_endpoint"`
	APIConfig         *json.RawMessage `json:"api_config,omitempty" db:"api_config"`
	ResponsePath      *string          `json:"response_path,omitempty" db:"response_path"`
	AutoPopulate      bool             `json:"auto_populate" db:"auto_populate"`
	PopulateFromDate  *time.Time       `json:"populate_from_date,omitempty" db:"populate_from_date"`
	LastPopulatedDate *time.Time       `json:"last_populated_date,omitempty" db:"last_populated_date"`
	IsActive          bool             `json:"is_active" db:"is_active"`
}

// APIConfiguration represents the parsed API config
type APIConfiguration struct {
	Headers     map[string]string `json:"headers,omitempty"`
	QueryParams map[string]string `json:"query_params,omitempty"`
	AuthType    string            `json:"auth_type,omitempty"` // bearer, apikey, none
	AuthValue   string            `json:"auth_value,omitempty"`
	Method      string            `json:"method,omitempty"` // GET, POST
}

// PricePopulationJob tracks background jobs for populating historical prices
type PricePopulationJob struct {
	ID            int        `json:"id" db:"id"`
	AssetID       int        `json:"asset_id" db:"asset_id"`
	MappingID     int        `json:"mapping_id" db:"mapping_id"`
	Status        string     `json:"status" db:"status"` // pending, running, completed, failed
	StartDate     time.Time  `json:"start_date" db:"start_date"`
	EndDate       time.Time  `json:"end_date" db:"end_date"`
	CurrentDate   *time.Time `json:"current_date,omitempty" db:"current_date"`
	TotalDays     int        `json:"total_days" db:"total_days"`
	CompletedDays int        `json:"completed_days" db:"completed_days"`
	ErrorMessage  *string    `json:"error_message,omitempty" db:"error_message"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
	StartedAt     *time.Time `json:"started_at,omitempty" db:"started_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	UpdatedAt     time.Time  `json:"updated_at" db:"updated_at"`
}
