package models

import (
	"encoding/json"
	"time"

	"github.com/tropicaldog17/nami/internal/errors"
)

// Predefined action names
const (
	ActionP2PBuyUSDT       = "p2p_buy_usdt"
	ActionP2PSellUSDT      = "p2p_sell_usdt"
	ActionSpendVND         = "spend_vnd"
	ActionCreditSpend      = "credit_spend_vnd"
	ActionSpotBuy          = "spot_buy"
	ActionBorrow           = "borrow"
	ActionRepayBorrow      = "repay_borrow"
	ActionStake            = "stake"
	ActionUnstake          = "unstake"
	ActionInitBalance      = "init_balance"
	ActionInternalTransfer = "internal_transfer"
)

type UnstakeParams struct {
	// Required fields
	Date               time.Time `json:"date"`
	InvestmentAccount  string    `json:"investment_account"`
	DestinationAccount string    `json:"destination_account"`
	Asset              string    `json:"asset"`

	// Either Amount or Quantity must be provided
	Amount   float64 `json:"amount,omitempty"`   // Total amount received in destination account currency (e.g. USD)
	Quantity float64 `json:"quantity,omitempty"` // Quantity of asset unstaked
	// Optional fields
	ExitPriceUSD   float64 `json:"exit_price_usd,omitempty"`   // Price per unit in USD at exit (if Amount not provided)
	ExitPriceLocal float64 `json:"exit_price_local,omitempty"` // Price per unit in local currency at exit (if Amount not provided)
	FXToUSD        float64 `json:"fx_to_usd,omitempty"`        // FX rate to USD at exit (if Amount not provided)
	FXToVND        float64 `json:"fx_to_vnd,omitempty"`        // FX rate to VND at exit (if Amount not provided)

	CloseAll bool   `json:"close_all,omitempty"` // If true, mark the original stake as closed even if not fully unstaked
	Note     string `json:"note,omitempty"`      // Optional note for the unstake transaction
}

type StakeParams struct {
	// Required fields
	Date              time.Time `json:"date"`
	SourceAccount     string    `json:"source_account"`
	InvestmentAccount string    `json:"investment_account"`
	Asset             string    `json:"asset"`
	Amount            float64   `json:"amount"` // Amount to stake in source account currency (e.g. USD)

	// Optional fields
	EntryPriceUSD   *float64 `json:"entry_price_usd,omitempty"`   // Price per unit in USD at entry
	EntryPriceLocal *float64 `json:"entry_price_local,omitempty"` // Price per unit in local currency at entry
	FXToUSD         *float64 `json:"fx_to_usd,omitempty"`         // FX rate to USD at entry
	FXToVND         *float64 `json:"fx_to_vnd,omitempty"`         // FX rate to VND at entry
}

func toMap[T any](s T) map[string]interface{} {
	data, _ := json.Marshal(s)
	var result map[string]interface{}
	json.Unmarshal(data, &result)
	return result
}

func fromMap[T any](m map[string]interface{}, s *T) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, s)
}

func (s StakeParams) ToMap() map[string]interface{} {
	return toMap(s)
}

func (s StakeParams) FromMap(m map[string]interface{}) error {
	return fromMap(m, &s)
}

func (u UnstakeParams) ToMap() map[string]interface{} {
	return toMap(u)
}

func (u UnstakeParams) FromMap(m map[string]interface{}) error {
	return fromMap(m, &u)
}

func (u UnstakeParams) Validate() error {
	if u.Date.IsZero() {
		return &errors.ErrValidation{Field: "date", Message: "date is required"}
	}
	if u.InvestmentAccount == "" {
		return &errors.ErrValidation{Field: "investment_account", Message: "investment_account is required"}
	}
	if u.DestinationAccount == "" {
		return &errors.ErrValidation{Field: "destination_account", Message: "destination_account is required"}
	}
	if u.Asset == "" {
		return &errors.ErrValidation{Field: "asset", Message: "asset is required"}
	}
	if u.Amount == 0 && u.Quantity == 0 {
		return &errors.ErrValidation{Field: "amount/quantity", Message: "either amount or quantity must be provided and non-zero"}
	}
	if u.Amount != 0 && u.Quantity != 0 {
		return &errors.ErrValidation{Field: "amount/quantity", Message: "only one of amount or quantity should be provided"}
	}
	if u.Amount == 0 {
		// Quantity provided, so exit price and FX rates are required
		if u.ExitPriceUSD == 0 && u.ExitPriceLocal == 0 {
			return &errors.ErrValidation{Field: "exit_price_usd/exit_price_local", Message: "either exit_price_usd or exit_price_local must be provided when quantity is specified"}
		}
		if u.ExitPriceUSD != 0 && u.ExitPriceLocal != 0 {
			return &errors.ErrValidation{Field: "exit_price_usd/exit_price_local", Message: "only one of exit_price_usd or exit_price_local should be provided"}
		}
		if u.ExitPriceLocal != 0 && u.FXToUSD == 0 {
			return &errors.ErrValidation{Field: "fx_to_usd", Message: "fx_to_usd is required when exit_price_local is provided"}
		}
		if u.ExitPriceLocal != 0 && u.FXToVND == 0 {
			return &errors.ErrValidation{Field: "fx_to_vnd", Message: "fx_to_vnd is required when exit_price_local is provided"}
		}
	}
	return nil
}

// ActionRequest represents a request to perform a predefined action
type ActionRequest struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

// ActionResponse returns the transactions created by the action
type ActionResponse struct {
	Action       string         `json:"action"`
	Transactions []*Transaction `json:"transactions"`
	ExecutedAt   time.Time      `json:"executed_at"`
}
