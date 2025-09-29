package models

import "time"

// Predefined action names
const (
	ActionP2PBuyUSDT  = "p2p_buy_usdt"
	ActionP2PSellUSDT = "p2p_sell_usdt"
	ActionSpendVND    = "spend_vnd"
	ActionCreditSpend = "credit_spend_vnd"
	ActionSpotBuy     = "spot_buy"
	ActionBorrow      = "borrow"
	ActionRepayBorrow = "repay_borrow"
	ActionStake       = "stake"
	ActionUnstake     = "unstake"
	ActionInitBalance = "init_balance"
)

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
