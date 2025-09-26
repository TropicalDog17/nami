package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// Period represents a time period for reporting
type Period struct {
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

// Holding represents current asset holdings
type Holding struct {
	Asset       string          `json:"asset" db:"asset"`
	Account     string          `json:"account" db:"account"`
	Quantity    decimal.Decimal `json:"quantity" db:"quantity"`
	ValueUSD    decimal.Decimal `json:"value_usd" db:"value_usd"`
	ValueVND    decimal.Decimal `json:"value_vnd" db:"value_vnd"`
	LastUpdated time.Time       `json:"last_updated" db:"last_updated"`
}

// CashFlowReport represents cash flow analysis
type CashFlowReport struct {
	Period      Period                     `json:"period"`
	TotalInUSD  decimal.Decimal            `json:"total_in_usd"`
	TotalOutUSD decimal.Decimal            `json:"total_out_usd"`
	NetUSD      decimal.Decimal            `json:"net_usd"`
	TotalInVND  decimal.Decimal            `json:"total_in_vnd"`
	TotalOutVND decimal.Decimal            `json:"total_out_vnd"`
	NetVND      decimal.Decimal            `json:"net_vnd"`
	ByType      map[string]*CashFlowByType `json:"by_type"`
	ByTag       map[string]*CashFlowByType `json:"by_tag"`
}

// CashFlowByType represents cash flow breakdown by type or tag
type CashFlowByType struct {
	InflowUSD  decimal.Decimal `json:"inflow_usd"`
	OutflowUSD decimal.Decimal `json:"outflow_usd"`
	NetUSD     decimal.Decimal `json:"net_usd"`
	InflowVND  decimal.Decimal `json:"inflow_vnd"`
	OutflowVND decimal.Decimal `json:"outflow_vnd"`
	NetVND     decimal.Decimal `json:"net_vnd"`
	Count      int             `json:"count"`
}

// SpendingReport represents spending analysis
type SpendingReport struct {
	Period         Period                    `json:"period"`
	TotalUSD       decimal.Decimal           `json:"total_usd"`
	TotalVND       decimal.Decimal           `json:"total_vnd"`
	ByTag          map[string]*SpendingByTag `json:"by_tag"`
	ByCounterparty map[string]*SpendingByTag `json:"by_counterparty"`
	TopExpenses    []*TransactionSummary     `json:"top_expenses"`
}

// SpendingByTag represents spending breakdown by tag or counterparty
type SpendingByTag struct {
	AmountUSD  decimal.Decimal `json:"amount_usd"`
	AmountVND  decimal.Decimal `json:"amount_vnd"`
	Count      int             `json:"count"`
	Percentage decimal.Decimal `json:"percentage"`
}

// TransactionSummary represents a summary of a transaction for reports
type TransactionSummary struct {
	ID           string          `json:"id"`
	Date         time.Time       `json:"date"`
	Type         string          `json:"type"`
	Asset        string          `json:"asset"`
	Account      string          `json:"account"`
	Counterparty *string         `json:"counterparty"`
	Tag          *string         `json:"tag"`
	AmountUSD    decimal.Decimal `json:"amount_usd"`
	AmountVND    decimal.Decimal `json:"amount_vnd"`
	Note         *string         `json:"note"`
}

// PnLReport represents profit and loss analysis
type PnLReport struct {
	Period           Period                 `json:"period"`
	RealizedPnLUSD   decimal.Decimal        `json:"realized_pnl_usd"`
	RealizedPnLVND   decimal.Decimal        `json:"realized_pnl_vnd"`
	UnrealizedPnLUSD decimal.Decimal        `json:"unrealized_pnl_usd"`
	UnrealizedPnLVND decimal.Decimal        `json:"unrealized_pnl_vnd"`
	TotalPnLUSD      decimal.Decimal        `json:"total_pnl_usd"`
	TotalPnLVND      decimal.Decimal        `json:"total_pnl_vnd"`
	ROIPercent       decimal.Decimal        `json:"roi_percent"`
	ByAsset          map[string]*AssetPnL   `json:"by_asset"`
	ByAccount        map[string]*AccountPnL `json:"by_account"`
}

// AssetPnL represents P&L breakdown by asset
type AssetPnL struct {
	Asset            string          `json:"asset"`
	RealizedPnLUSD   decimal.Decimal `json:"realized_pnl_usd"`
	RealizedPnLVND   decimal.Decimal `json:"realized_pnl_vnd"`
	UnrealizedPnLUSD decimal.Decimal `json:"unrealized_pnl_usd"`
	UnrealizedPnLVND decimal.Decimal `json:"unrealized_pnl_vnd"`
	TotalPnLUSD      decimal.Decimal `json:"total_pnl_usd"`
	TotalPnLVND      decimal.Decimal `json:"total_pnl_vnd"`
	CurrentQuantity  decimal.Decimal `json:"current_quantity"`
	AverageCostUSD   decimal.Decimal `json:"average_cost_usd"`
	CurrentValueUSD  decimal.Decimal `json:"current_value_usd"`
	CurrentValueVND  decimal.Decimal `json:"current_value_vnd"`
}

// AccountPnL represents P&L breakdown by account
type AccountPnL struct {
	Account          string          `json:"account"`
	RealizedPnLUSD   decimal.Decimal `json:"realized_pnl_usd"`
	RealizedPnLVND   decimal.Decimal `json:"realized_pnl_vnd"`
	UnrealizedPnLUSD decimal.Decimal `json:"unrealized_pnl_usd"`
	UnrealizedPnLVND decimal.Decimal `json:"unrealized_pnl_vnd"`
	TotalPnLUSD      decimal.Decimal `json:"total_pnl_usd"`
	TotalPnLVND      decimal.Decimal `json:"total_pnl_vnd"`
	TotalValueUSD    decimal.Decimal `json:"total_value_usd"`
	TotalValueVND    decimal.Decimal `json:"total_value_vnd"`
}

// HoldingSummary represents aggregated holdings
type HoldingSummary struct {
	TotalValueUSD decimal.Decimal       `json:"total_value_usd"`
	TotalValueVND decimal.Decimal       `json:"total_value_vnd"`
	ByAsset       map[string]*Holding   `json:"by_asset"`
	ByAccount     map[string][]*Holding `json:"by_account"`
	LastUpdated   time.Time             `json:"last_updated"`
}
