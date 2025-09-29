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

// OutflowProjection represents expected cash out for a borrow
type OutflowProjection struct {
	ID                 string          `json:"id"`
	Account            string          `json:"account"`
	Asset              string          `json:"asset"`
	RemainingPrincipal decimal.Decimal `json:"remaining_principal"`
	InterestAccrued    decimal.Decimal `json:"interest_accrued"`
	TotalOutflow       decimal.Decimal `json:"total_outflow"`
	AsOf               time.Time       `json:"as_of"`
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

	// Operating totals exclude financing flows (borrow, repay_borrow, interest_expense)
	OperatingInUSD  decimal.Decimal `json:"operating_in_usd"`
	OperatingOutUSD decimal.Decimal `json:"operating_out_usd"`
	OperatingNetUSD decimal.Decimal `json:"operating_net_usd"`
	OperatingInVND  decimal.Decimal `json:"operating_in_vnd"`
	OperatingOutVND decimal.Decimal `json:"operating_out_vnd"`
	OperatingNetVND decimal.Decimal `json:"operating_net_vnd"`

	// Financing totals include borrow (as inflow), repay_borrow and interest_expense (as outflows)
	FinancingInUSD  decimal.Decimal `json:"financing_in_usd"`
	FinancingOutUSD decimal.Decimal `json:"financing_out_usd"`
	FinancingNetUSD decimal.Decimal `json:"financing_net_usd"`
	FinancingInVND  decimal.Decimal `json:"financing_in_vnd"`
	FinancingOutVND decimal.Decimal `json:"financing_out_vnd"`
	FinancingNetVND decimal.Decimal `json:"financing_net_vnd"`

	// Combined totals = Operating + Financing
	CombinedInUSD  decimal.Decimal `json:"combined_in_usd"`
	CombinedOutUSD decimal.Decimal `json:"combined_out_usd"`
	CombinedNetUSD decimal.Decimal `json:"combined_net_usd"`
	CombinedInVND  decimal.Decimal `json:"combined_in_vnd"`
	CombinedOutVND decimal.Decimal `json:"combined_out_vnd"`
	CombinedNetVND decimal.Decimal `json:"combined_net_vnd"`
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

// OutstandingBorrow represents an outstanding borrow by asset and account
type OutstandingBorrow struct {
	Asset   string          `json:"asset"`
	Account string          `json:"account"`
	Amount  decimal.Decimal `json:"amount"`
}
