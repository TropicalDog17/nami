package services

import (
	"context"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// ActionService composes one or more transactions from high-level actions
type ActionService interface {
	Perform(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error)
}

type actionService struct {
	db                 *db.DB
	transactionService TransactionService
	linkService        LinkService
}

func NewActionService(database *db.DB, txService TransactionService) ActionService {
	return &actionService{db: database, transactionService: txService}
}

func (s *actionService) Perform(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	if req == nil || req.Action == "" {
		return nil, fmt.Errorf("action is required")
	}

	switch req.Action {
	case models.ActionP2PBuyUSDT:
		return s.performP2P(ctx, req, true)
	case models.ActionP2PSellUSDT:
		return s.performP2P(ctx, req, false)
	case models.ActionSpendVND:
		return s.performSpend(ctx, req, false)
	case models.ActionCreditSpend:
		return s.performSpend(ctx, req, true)
	case models.ActionSpotBuy:
		return s.performSpotBuy(ctx, req)
	case models.ActionBorrow:
		return s.performBorrow(ctx, req)
	case models.ActionRepayBorrow:
		return s.performRepayBorrow(ctx, req)
	case models.ActionStake:
		return s.performStake(ctx, req)
	case models.ActionUnstake:
		return s.performUnstake(ctx, req)
	case models.ActionInitBalance:
		return s.performInitBalance(ctx, req)
	default:
		return nil, fmt.Errorf("unknown action: %s", req.Action)
	}
}

// Helper to parse common params safely
func getString(params map[string]interface{}, key string) (string, bool) {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			return s, true
		}
	}
	return "", false
}

func getDecimal(params map[string]interface{}, key string) (decimal.Decimal, bool) {
	if v, ok := params[key]; ok {
		switch t := v.(type) {
		case float64:
			return decimal.NewFromFloat(t), true
		case int:
			return decimal.NewFromInt(int64(t)), true
		case int64:
			return decimal.NewFromInt(t), true
		case string:
			d, err := decimal.NewFromString(t)
			if err == nil {
				return d, true
			}
		}
	}
	return decimal.Zero, false
}

func getDate(params map[string]interface{}, key string) (time.Time, bool) {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			if s == "" {
				return time.Time{}, false
			}
			// Support YYYY-MM-DD
			if t, err := time.Parse("2006-01-02", s); err == nil {
				return t, true
			}
			// ISO fallback
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t, true
			}
		}
	}
	return time.Now(), false
}

// P2P buy/sell USDT with VND
// Params: date, exchange_account (e.g. "Binance Spot"), bank_account (e.g. "Bank"), vnd_amount, price_vnd_per_usdt, fee_vnd(optional), counterparty(optional)
func (s *actionService) performP2P(ctx context.Context, req *models.ActionRequest, isBuy bool) (*models.ActionResponse, error) {
	params := req.Params
	date, _ := getDate(params, "date")
	exchangeAccount, ok1 := getString(params, "exchange_account")
	bankAccount, ok2 := getString(params, "bank_account")
	priceVND, ok3 := getDecimal(params, "price_vnd_per_usdt")
	vndAmount, ok4 := getDecimal(params, "vnd_amount")
	feeVND, _ := getDecimal(params, "fee_vnd")
	counterparty, _ := getString(params, "counterparty")

	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params: exchange_account, bank_account, price_vnd_per_usdt, vnd_amount")
	}

	if priceVND.IsZero() {
		return nil, fmt.Errorf("price_vnd_per_usdt must be > 0")
	}

	// Calculate USDT quantity
	qty := vndAmount.Div(priceVND)

	var created []*models.Transaction
	const usdPerVnd = 1.0 / 24000.0

	if isBuy {
		// 1) Bank VND outflow to counterparty
		bankTx := &models.Transaction{
			Date:    date,
			Type:    "transfer_out",
			Asset:   "VND",
			Account: bankAccount,
			Counterparty: func() *string {
				if counterparty == "" {
					return nil
				}
				return &counterparty
			}(),
			Quantity:   vndAmount,
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromFloat(usdPerVnd),
			FXToVND:    decimal.NewFromInt(1),
			FeeUSD:     feeVND.Mul(decimal.NewFromFloat(usdPerVnd)),
			FeeVND:     feeVND,
		}
		bankTx.PreSave()
		if err := s.transactionService.CreateTransaction(ctx, bankTx); err != nil {
			return nil, err
		}
		created = append(created, bankTx)

		// 2) Exchange USDT inflow with price in VND per USDT
		exchTx := &models.Transaction{
			Date:    date,
			Type:    "transfer_in",
			Asset:   "USDT",
			Account: exchangeAccount,
			Counterparty: func() *string {
				if counterparty == "" {
					return nil
				}
				return &counterparty
			}(),
			Quantity:   qty,
			PriceLocal: priceVND,
			FXToUSD:    decimal.NewFromFloat(usdPerVnd),
			FXToVND:    decimal.NewFromInt(1),
		}
		exchTx.PreSave()
		if err := s.transactionService.CreateTransaction(ctx, exchTx); err != nil {
			return nil, err
		}
		created = append(created, exchTx)
	} else {
		// SELL USDT for VND
		// 1) Exchange USDT outflow
		usdtOut := &models.Transaction{
			Date:    date,
			Type:    "transfer_out",
			Asset:   "USDT",
			Account: exchangeAccount,
			Counterparty: func() *string {
				if counterparty == "" {
					return nil
				}
				return &counterparty
			}(),
			Quantity:   qty,
			PriceLocal: priceVND,
			FXToUSD:    decimal.NewFromFloat(usdPerVnd),
			FXToVND:    decimal.NewFromInt(1),
		}
		usdtOut.PreSave()
		if err := s.transactionService.CreateTransaction(ctx, usdtOut); err != nil {
			return nil, err
		}
		created = append(created, usdtOut)

		// 2) Bank VND inflow
		vndIn := &models.Transaction{
			Date:    date,
			Type:    "transfer_in",
			Asset:   "VND",
			Account: bankAccount,
			Counterparty: func() *string {
				if counterparty == "" {
					return nil
				}
				return &counterparty
			}(),
			Quantity:   vndAmount,
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromFloat(usdPerVnd),
			FXToVND:    decimal.NewFromInt(1),
		}
		vndIn.PreSave()
		if err := s.transactionService.CreateTransaction(ctx, vndIn); err != nil {
			return nil, err
		}
		created = append(created, vndIn)

		// Optional fee in VND (bank/cex fee)
		if !feeVND.IsZero() {
			feeTx := &models.Transaction{
				Date:       date,
				Type:       "fee",
				Asset:      "VND",
				Account:    bankAccount,
				Quantity:   feeVND,
				PriceLocal: decimal.NewFromInt(1),
				FXToUSD:    decimal.NewFromFloat(usdPerVnd),
				FXToVND:    decimal.NewFromInt(1),
			}
			feeTx.PreSave()
			if err := s.transactionService.CreateTransaction(ctx, feeTx); err != nil {
				return nil, err
			}
			created = append(created, feeTx)
		}
	}

	return &models.ActionResponse{Action: req.Action, Transactions: created, ExecutedAt: time.Now()}, nil
}

// Spending VND, optionally via credit card
// Params: date, account ("Bank" or "CreditCard"), vnd_amount, counterparty, tag, note
func (s *actionService) performSpend(ctx context.Context, req *models.ActionRequest, isCredit bool) (*models.ActionResponse, error) {
	params := req.Params
	date, _ := getDate(params, "date")
	account, ok1 := getString(params, "account")
	vndAmount, ok2 := getDecimal(params, "vnd_amount")
	counterparty, _ := getString(params, "counterparty")
	tag, _ := getString(params, "tag")
	note, _ := getString(params, "note")
	if !(ok1 && ok2) {
		return nil, fmt.Errorf("missing required params: account, vnd_amount")
	}

	t := "expense"
	// Leave FX rates as zero so TransactionService.populateFXRates fetches from the FX provider.
	// For CreditCard, model as expense on account; CashFlow derived handles zero immediate cash flow
	tx := &models.Transaction{
		Date:       date,
		Type:       t,
		Asset:      "VND",
		Account:    account,
		Quantity:   vndAmount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.Zero,
		FXToVND:    decimal.Zero,
		FeeUSD:     decimal.Zero,
		FeeVND:     decimal.Zero,
	}
	if counterparty != "" {
		tx.Counterparty = &counterparty
	}
	if tag != "" {
		tx.Tag = &tag
	}
	if note != "" {
		tx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{tx}, ExecutedAt: time.Now()}, nil
}

// Spot buy asset on exchange using quote currency (e.g., buy BTC with USDT)
// Params: date, exchange_account, base_asset, quote_asset, quantity, price_quote, counterparty(optional), fee_quote(optional)
func (s *actionService) performSpotBuy(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	account, ok1 := getString(p, "exchange_account")
	base, ok2 := getString(p, "base_asset")
	quote, ok3 := getString(p, "quote_asset")
	qty, ok4 := getDecimal(p, "quantity")
	price, ok5 := getDecimal(p, "price_quote")
	fee, _ := getDecimal(p, "fee_quote")
	counterparty, _ := getString(p, "counterparty")
	if !(ok1 && ok2 && ok3 && ok4 && ok5) {
		return nil, fmt.Errorf("missing required params for spot_buy")
	}

	// 1) Buy base
	buyTx := &models.Transaction{
		Date:       date,
		Type:       "buy",
		Asset:      base,
		Account:    account,
		Quantity:   qty,
		PriceLocal: price,
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
		FeeUSD:     decimal.Zero,
		FeeVND:     decimal.Zero,
	}
	if counterparty != "" {
		buyTx.Counterparty = &counterparty
	}
	if err := s.transactionService.CreateTransaction(ctx, buyTx); err != nil {
		return nil, err
	}

	// 2) Spend quote (sell/transfer_out) quantity = qty * price
	spent := qty.Mul(price)
	sellTx := &models.Transaction{
		Date:       date,
		Type:       "sell",
		Asset:      quote,
		Account:    account,
		Quantity:   spent,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
		FeeUSD:     decimal.Zero,
		FeeVND:     decimal.Zero,
	}
	if counterparty != "" {
		sellTx.Counterparty = &counterparty
	}
	if !fee.IsZero() {
		// 3) Fee in quote asset
		feeTx := &models.Transaction{
			Date:       date,
			Type:       "fee",
			Asset:      quote,
			Account:    account,
			Quantity:   fee,
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromFloat(1.0),
			FXToVND:    decimal.NewFromInt(1),
		}
		if err := s.transactionService.CreateTransaction(ctx, feeTx); err != nil {
			return nil, err
		}
		return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{buyTx, sellTx, feeTx}, ExecutedAt: time.Now()}, nil
	}
	if err := s.transactionService.CreateTransaction(ctx, sellTx); err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{buyTx, sellTx}, ExecutedAt: time.Now()}, nil
}

// Borrow money
// Params: date, account (liability account or source), asset, amount, note(optional), counterparty(optional)
func (s *actionService) performBorrow(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	account, ok1 := getString(p, "account")
	asset, ok2 := getString(p, "asset")
	amount, ok3 := getDecimal(p, "amount")
	counterparty, _ := getString(p, "counterparty")
	note, _ := getString(p, "note")
	if !(ok1 && ok2 && ok3) {
		return nil, fmt.Errorf("missing required params: account, asset, amount")
	}

	tx := &models.Transaction{
		Date:       date,
		Type:       "borrow",
		Asset:      asset,
		Account:    account,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
	}
	if counterparty != "" {
		tx.Counterparty = &counterparty
	}
	if note != "" {
		tx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{tx}, ExecutedAt: time.Now()}, nil
}

// Repay borrowed money
// Params: date, account, asset, amount, counterparty(optional), note(optional)
func (s *actionService) performRepayBorrow(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	account, ok1 := getString(p, "account")
	asset, ok2 := getString(p, "asset")
	amount, ok3 := getDecimal(p, "amount")
	counterparty, _ := getString(p, "counterparty")
	note, _ := getString(p, "note")
	if !(ok1 && ok2 && ok3) {
		return nil, fmt.Errorf("missing required params: account, asset, amount")
	}

	tx := &models.Transaction{
		Date:       date,
		Type:       "repay_borrow",
		Asset:      asset,
		Account:    account,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
	}
	if counterparty != "" {
		tx.Counterparty = &counterparty
	}
	if note != "" {
		tx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}
	// Optional link to original borrow
	if borrowID, ok := getString(p, "borrow_id"); ok && borrowID != "" && s.linkService != nil {
		_ = s.linkService.CreateLink(ctx, &models.TransactionLink{LinkType: "borrow_repay", FromTx: borrowID, ToTx: tx.ID})
	}
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{tx}, ExecutedAt: time.Now()}, nil
}

// Stake into protocol/investment with fee as percentage of amount
// Params: date, source_account, investment_account, asset, amount, fee_percent(optional), counterparty, tag, horizon(optional), note(optional)
func (s *actionService) performStake(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	source, ok1 := getString(p, "source_account")
	invest, ok2 := getString(p, "investment_account")
	asset, ok3 := getString(p, "asset")
	amount, ok4 := getDecimal(p, "amount")
	counterparty, _ := getString(p, "counterparty")
	tag, _ := getString(p, "tag")
	note, _ := getString(p, "note")
	feePct, _ := getDecimal(p, "fee_percent") // e.g., 0.5 means 0.5%
	horizon, _ := getString(p, "horizon")
	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params for stake")
	}

	var horizonPtr *string
	if horizon != "" {
		horizonPtr = &horizon
	}

	// 1) transfer_out from source
	outTx := &models.Transaction{
		Date:       date,
		Type:       "transfer_out",
		Asset:      asset,
		Account:    source,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
		Horizon:    horizonPtr,
	}
	if counterparty != "" {
		outTx.Counterparty = &counterparty
	}
	if tag != "" {
		outTx.Tag = &tag
	}
	if note != "" {
		outTx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, outTx); err != nil {
		return nil, err
	}

	// 2) deposit into investment
	inTx := &models.Transaction{
		Date:       date,
		Type:       "deposit",
		Asset:      asset,
		Account:    invest,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
		Horizon:    horizonPtr,
		EntryDate:  &date,
	}
	if counterparty != "" {
		inTx.Counterparty = &counterparty
	}
	if tag != "" {
		inTx.Tag = &tag
	}
	if note != "" {
		inTx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, inTx); err != nil {
		return nil, err
	}

	created := []*models.Transaction{outTx, inTx}

	// 3) optional fee in same asset, calculated by percentage of amount
	if !feePct.IsZero() {
		feeQty := amount.Mul(feePct).Div(decimal.NewFromInt(100))
		if feeQty.IsPositive() {
			feeTx := &models.Transaction{
				Date:       date,
				Type:       "fee",
				Asset:      asset,
				Account:    source,
				Quantity:   feeQty,
				PriceLocal: decimal.NewFromInt(1),
				FXToUSD:    decimal.NewFromFloat(1.0),
				FXToVND:    decimal.NewFromInt(1),
			}
			if err := s.transactionService.CreateTransaction(ctx, feeTx); err == nil {
				created = append(created, feeTx)
			}
		}
	}

	return &models.ActionResponse{Action: req.Action, Transactions: created, ExecutedAt: time.Now()}, nil
}

// Unstake reverses a prior stake
// Params: date, investment_account, destination_account, asset, amount, stake_deposit_tx_id (link), note(optional)
func (s *actionService) performUnstake(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	invest, ok1 := getString(p, "investment_account")
	dest, ok2 := getString(p, "destination_account")
	asset, ok3 := getString(p, "asset")
	amount, ok4 := getDecimal(p, "amount")
	stakeID, _ := getString(p, "stake_deposit_tx_id")
	note, _ := getString(p, "note")
	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params for unstake")
	}

	// 1) withdraw from investment
	outTx := &models.Transaction{
		Date:       date,
		Type:       "withdraw",
		Asset:      asset,
		Account:    invest,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
	}
	if note != "" {
		outTx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, outTx); err != nil {
		return nil, err
	}

	// 2) transfer_in to destination
	inTx := &models.Transaction{
		Date:       date,
		Type:       "transfer_in",
		Asset:      asset,
		Account:    dest,
		Quantity:   amount,
		PriceLocal: decimal.NewFromInt(1),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromInt(1),
		ExitDate:   &date,
	}
	if note != "" {
		inTx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, inTx); err != nil {
		return nil, err
	}

	if stakeID != "" && s.linkService != nil {
		_ = s.linkService.CreateLink(ctx, &models.TransactionLink{LinkType: "stake_unstake", FromTx: stakeID, ToTx: outTx.ID})
	}

	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{outTx, inTx}, ExecutedAt: time.Now()}, nil
}

// Initialize an existing balance for tracking without modeling the prior inflow/outflow
// Params: date, account, asset, quantity, price_local(optional, default 1), fx_to_usd(optional), fx_to_vnd(optional), tag(optional), note(optional)
func (s *actionService) performInitBalance(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	account, ok1 := getString(p, "account")
	asset, ok2 := getString(p, "asset")
	qty, ok3 := getDecimal(p, "quantity")
	tag, _ := getString(p, "tag")
	note, _ := getString(p, "note")
	priceLocal, _ := getDecimal(p, "price_local")
	fxUSD, hasUSD := getDecimal(p, "fx_to_usd")
	fxVND, hasVND := getDecimal(p, "fx_to_vnd")
	if !(ok1 && ok2 && ok3) {
		return nil, fmt.Errorf("missing required params: account, asset, quantity")
	}

	if priceLocal.IsZero() {
		priceLocal = decimal.NewFromInt(1)
	}

	tx := &models.Transaction{
		Date:       date,
		Type:       "deposit",
		Asset:      asset,
		Account:    account,
		Quantity:   qty,
		PriceLocal: priceLocal,
		FXToUSD:    decimal.Zero,
		FXToVND:    decimal.Zero,
		FeeUSD:     decimal.Zero,
		FeeVND:     decimal.Zero,
		Tag: func() *string {
			if tag == "" {
				return nil
			}
			return &tag
		}(),
		Note: func() *string {
			if note == "" {
				return nil
			}
			return &note
		}(),
	}

	// If explicit FX provided, set them to avoid auto-population if provider exists
	if hasUSD {
		tx.FXToUSD = fxUSD
	}
	if hasVND {
		tx.FXToVND = fxVND
	}

	if err := s.transactionService.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{tx}, ExecutedAt: time.Now()}, nil
}
