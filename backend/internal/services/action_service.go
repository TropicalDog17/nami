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
	priceService       AssetPriceService
	investmentService  InvestmentService
}

func NewActionService(database *db.DB, txService TransactionService) ActionService {
	return &actionService{db: database, transactionService: txService}
}

// NewActionServiceWithPrices allows passing an AssetPriceService for price lookups
func NewActionServiceWithPrices(database *db.DB, txService TransactionService, priceService AssetPriceService) ActionService {
	return &actionService{db: database, transactionService: txService, priceService: priceService}
}

// NewActionServiceFull allows passing all optional services
func NewActionServiceFull(database *db.DB, txService TransactionService, linkService LinkService, priceService AssetPriceService) ActionService {
	return &actionService{db: database, transactionService: txService, linkService: linkService, priceService: priceService}
}

// NewActionServiceWithInvestments includes the investment service for enhanced investment tracking
func NewActionServiceWithInvestments(database *db.DB, txService TransactionService, linkService LinkService, priceService AssetPriceService, investmentService InvestmentService) ActionService {
	return &actionService{
		db:                 database,
		transactionService: txService,
		linkService:        linkService,
		priceService:       priceService,
		investmentService:  investmentService,
	}
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
	case models.ActionInternalTransfer:
		return s.performInternalTransfer(ctx, req)
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

func getBool(params map[string]interface{}, key string) (bool, bool) {
	if v, ok := params[key]; ok {
		switch t := v.(type) {
		case bool:
			return t, true
		case string:
			if t == "true" {
				return true, true
			}
			if t == "false" {
				return false, true
			}
		}
	}
	return false, false
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
			Quantity:     vndAmount,
			PriceLocal:   decimal.NewFromInt(1),
			FXToUSD:      decimal.NewFromFloat(usdPerVnd),
			FXToVND:      decimal.NewFromInt(1),
			FeeUSD:       feeVND.Mul(decimal.NewFromFloat(usdPerVnd)),
			FeeVND:       feeVND,
			InternalFlow: func() *bool { b := true; return &b }(),
		}
		bankTx.PreSave()
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
			Quantity:     qty,
			PriceLocal:   priceVND,
			FXToUSD:      decimal.NewFromFloat(usdPerVnd),
			FXToVND:      decimal.NewFromInt(1),
			InternalFlow: func() *bool { b := true; return &b }(),
		}
		exchTx.PreSave()
		created = append(created, exchTx)
		// Create atomically and link as one action
		saved, err := s.transactionService.CreateTransactionsBatch(ctx, created, "action")
		if err != nil {
			return nil, err
		}
		return &models.ActionResponse{Action: req.Action, Transactions: saved, ExecutedAt: time.Now()}, nil
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
			Quantity:     qty,
			PriceLocal:   priceVND,
			FXToUSD:      decimal.NewFromFloat(usdPerVnd),
			FXToVND:      decimal.NewFromInt(1),
			InternalFlow: func() *bool { b := true; return &b }(),
		}
		usdtOut.PreSave()
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
			Quantity:     vndAmount,
			PriceLocal:   decimal.NewFromInt(1),
			FXToUSD:      decimal.NewFromFloat(usdPerVnd),
			FXToVND:      decimal.NewFromInt(1),
			InternalFlow: func() *bool { b := true; return &b }(),
		}
		vndIn.PreSave()
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
			created = append(created, feeTx)
		}
	}
	// Create atomically and link as one action
	saved, err := s.transactionService.CreateTransactionsBatch(ctx, created, "action")
	if err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: saved, ExecutedAt: time.Now()}, nil
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
	price, hasPrice := getDecimal(p, "price_quote")
	feeQuote, _ := getDecimal(p, "fee_quote")
	feeBase, _ := getDecimal(p, "fee_base")
	feePercent, _ := getDecimal(p, "fee_percent")
	counterparty, _ := getString(p, "counterparty")
	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params for spot_buy")
	}

	// Auto-fetch price when not provided
	if !hasPrice || price.IsZero() {
		if s.priceService == nil {
			return nil, fmt.Errorf("price service unavailable and price_quote not provided")
		}
		// Try to fetch price for the given date; fall back to same-day daily price
		ap, err := s.priceService.GetDaily(ctx, base, quote, date)
		if err != nil || ap == nil || ap.Price.IsZero() {
			return nil, fmt.Errorf("failed to fetch price for %s/%s: %v", base, quote, err)
		}
		price = ap.Price
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
	// 3) Optional fee handling: percentage, base, or quote
	created := []*models.Transaction{buyTx, sellTx}
	// Calculate explicit fee quantities, prefer percent > base/quote when provided
	var feeBaseQty decimal.Decimal
	var feeQuoteQty decimal.Decimal
	if !feePercent.IsZero() {
		// percentage of spent (in quote) -> fee in quote
		spent := qty.Mul(price)
		feeQuoteQty = spent.Mul(feePercent).Div(decimal.NewFromInt(100))
	}
	if !feeBase.IsZero() {
		feeBaseQty = feeBase
	}
	if !feeQuote.IsZero() {
		feeQuoteQty = feeQuote
	}

	// Create fee transactions when amounts > 0
	if feeBaseQty.IsPositive() {
		feeTx := &models.Transaction{
			Date:       date,
			Type:       "fee",
			Asset:      base,
			Account:    account,
			Quantity:   feeBaseQty,
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromFloat(1.0),
			FXToVND:    decimal.NewFromInt(1),
		}
		if err := s.transactionService.CreateTransaction(ctx, feeTx); err != nil {
			return nil, err
		}
		created = append(created, feeTx)
	}
	if feeQuoteQty.IsPositive() {
		feeTx := &models.Transaction{
			Date:       date,
			Type:       "fee",
			Asset:      quote,
			Account:    account,
			Quantity:   feeQuoteQty,
			PriceLocal: decimal.NewFromInt(1),
			FXToUSD:    decimal.NewFromFloat(1.0),
			FXToVND:    decimal.NewFromInt(1),
		}
		if err := s.transactionService.CreateTransaction(ctx, feeTx); err != nil {
			return nil, err
		}
		created = append(created, feeTx)
	}
	if err := s.transactionService.CreateTransaction(ctx, sellTx); err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: created}, nil
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
		// Leave FX zero so TransactionService can auto-populate correct rates
		FXToUSD: decimal.Zero,
		FXToVND: decimal.Zero,
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
		// Leave FX zero so TransactionService can auto-populate correct rates
		FXToUSD: decimal.Zero,
		FXToVND: decimal.Zero,
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
		Date:         date,
		Type:         "transfer_out",
		Asset:        asset,
		Account:      source,
		Quantity:     amount,
		PriceLocal:   decimal.NewFromInt(1),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
		Horizon:      horizonPtr,
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

	// 2) deposit into investment (net of fee when provided)
	netAmount := amount
	if !feePct.IsZero() {
		feeQty := amount.Mul(feePct).Div(decimal.NewFromInt(100))
		if feeQty.IsPositive() {
			netAmount = amount.Sub(feeQty)
		}
	}
	inTx := &models.Transaction{
		Date:         date,
		Type:         "deposit",
		Asset:        asset,
		Account:      invest,
		Quantity:     netAmount,
		PriceLocal:   decimal.NewFromInt(1),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
		Horizon:      horizonPtr,
		EntryDate:    &date,
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
	// Enhanced: Use InvestmentService if available for better investment tracking
	if s.investmentService != nil {
		// For investments, we need to set the correct entry price (default to 1.0 for USDT-like assets)
		entryPrice := decimal.NewFromInt(1.0)
		if entryPriceUSD, hasEntryPrice := getDecimal(p, "entry_price_usd"); hasEntryPrice && !entryPriceUSD.IsZero() {
			entryPrice = entryPriceUSD
		}
		inTx.Type = "stake" // Use stake type for investment tracking
		inTx.PriceLocal = entryPrice
		inTx.PreSave() // Calculate derived fields including AmountUSD

		// Process stake using investment service which handles investment creation/updates properly
		_, err := s.investmentService.ProcessStake(ctx, inTx)
		if err != nil {
			return nil, fmt.Errorf("failed to process stake investment: %w", err)
		}
	} else {
		// Fallback to original behavior
		if err := s.transactionService.CreateTransaction(ctx, inTx); err != nil {
			return nil, err
		}
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
// Params: date, investment_account, destination_account, asset, amount (REQUIRED),
//
//	stake_deposit_tx_id (link), close_all (optional flag to mark position closed),
//	exit_price_usd (optional), note(optional)
func (s *actionService) performUnstake(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	invest, ok1 := getString(p, "investment_account")
	dest, ok2 := getString(p, "destination_account")
	asset, ok3 := getString(p, "asset")
	amount, ok4 := getDecimal(p, "amount")
	closeAll, _ := getBool(p, "close_all")
	stakeID, _ := getString(p, "stake_deposit_tx_id")
	note, _ := getString(p, "note")
	exitPriceUSD, hasExitPrice := getDecimal(p, "exit_price_usd")

	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params for unstake: investment_account, destination_account, asset, amount are all required")
	}

	if amount.IsZero() || amount.IsNegative() {
		return nil, fmt.Errorf("amount must be positive")
	}

	// Get the original stake deposit to retrieve entry date for PnL calculation
	var entryDatePtr *time.Time
	var entryPriceUSD decimal.Decimal
	if stakeID != "" {
		if orig, err := s.transactionService.GetTransaction(ctx, stakeID); err == nil && orig != nil {
			entryDatePtr = orig.EntryDate
			entryPriceUSD = orig.PriceLocal
		}
	}

	// Determine exit price in USD per unit
	// Priority:
	// 1) explicit exit_price_usd
	// 2) exit_amount_usd (derive price = exit_amount / stake_amount)
	// 3) fetch daily price via AssetPriceService
	// 4) fallback 1:1
	var finalExitPriceUSD decimal.Decimal
	if hasExitPrice && !exitPriceUSD.IsZero() {
		finalExitPriceUSD = exitPriceUSD
	} else if s.priceService != nil {
		if ap, err := s.priceService.GetDaily(ctx, asset, "USD", date); err == nil && ap != nil {
			finalExitPriceUSD = ap.Price
		} else {
			// Fallback
			finalExitPriceUSD = entryPriceUSD
		}
	} else {
		// Default: assume 1:1 (no gain/loss)
		finalExitPriceUSD = entryPriceUSD
	}

	// 1) withdraw from investment
	outTx := &models.Transaction{
		Date:         date,
		Type:         "withdraw",
		Asset:        asset,
		Account:      invest,
		Quantity:     amount,
		PriceLocal:   finalExitPriceUSD,
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
		EntryDate:    entryDatePtr, // Set entry date for PnL calculation
	}
	if stakeID != "" {
		outTx.DepositID = &stakeID
	}
	if note != "" {
		outTx.Note = &note
	}
	// Enhanced: Use InvestmentService if available for better investment tracking
	if s.investmentService != nil {
		outTx.Type = "unstake" // Use unstake type for investment tracking
		outTx.PreSave() // Calculate derived fields including AmountUSD

		// Process unstake using investment service which handles cost basis properly
		_, err := s.investmentService.ProcessUnstake(ctx, outTx)
		if err != nil {
			return nil, fmt.Errorf("failed to process unstake investment: %w", err)
		}
	} else {
		// Fallback to original behavior
		if err := s.transactionService.CreateTransaction(ctx, outTx); err != nil {
			return nil, err
		}
	}

	// 2) transfer_in to destination
	inTx := &models.Transaction{
		Date:         date,
		Type:         "transfer_in",
		Asset:        asset,
		Account:      dest,
		Quantity:     amount,
		PriceLocal:   finalExitPriceUSD,
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
		ExitDate:     &date,
	}
	if note != "" {
		inTx.Note = &note
	}
	if err := s.transactionService.CreateTransaction(ctx, inTx); err != nil {
		return nil, err
	}

	// Create link between stake deposit and unstake withdraw for PnL tracking
	if stakeID != "" && s.linkService != nil {
		_ = s.linkService.CreateLink(ctx, &models.TransactionLink{LinkType: "stake_unstake", FromTx: stakeID, ToTx: outTx.ID})
	}

	// Mark the original stake deposit as ended by setting its ExitDate if close_all is true
	if closeAll && stakeID != "" {
		if orig, err := s.transactionService.GetTransaction(ctx, stakeID); err == nil && orig != nil {
			orig.ExitDate = &date
			_ = s.transactionService.UpdateTransaction(ctx, orig)
		}
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
	priceLocal, hasPriceLocal := getDecimal(p, "price_local")
	fxUSD, hasUSD := getDecimal(p, "fx_to_usd")
	fxVND, hasVND := getDecimal(p, "fx_to_vnd")
	if !(ok1 && ok2 && ok3) {
		return nil, fmt.Errorf("missing required params: account, asset, quantity")
	}

	// For cryptocurrencies, fetch the price if not provided
	if models.IsCryptocurrency(asset) && !hasPriceLocal {
		if s.priceService != nil {
			// Fetch price in USD
			ap, err := s.priceService.GetDaily(ctx, asset, "USD", date)
			if err == nil && ap != nil && !ap.Price.IsZero() {
				priceLocal = ap.Price
				// For crypto, price_local is in USD, so fx_to_usd should be 1
				if !hasUSD {
					fxUSD = decimal.NewFromInt(1)
					hasUSD = true
				}
			} else {
				return nil, fmt.Errorf("failed to fetch price for %s on %s: %v", asset, date.Format("2006-01-02"), err)
			}
		} else {
			return nil, fmt.Errorf("price service not available for cryptocurrency %s", asset)
		}
	} else if priceLocal.IsZero() {
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

// Internal transfer between two accounts of the same asset
// Params: date, source_account, destination_account, asset, amount, note(optional), counterparty(optional)
func (s *actionService) performInternalTransfer(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	p := req.Params
	date, _ := getDate(p, "date")
	source, ok1 := getString(p, "source_account")
	dest, ok2 := getString(p, "destination_account")
	asset, ok3 := getString(p, "asset")
	amount, ok4 := getDecimal(p, "amount")
	counterparty, _ := getString(p, "counterparty")
	note, _ := getString(p, "note")
	if !(ok1 && ok2 && ok3 && ok4) {
		return nil, fmt.Errorf("missing required params: source_account, destination_account, asset, amount")
	}
	if source == dest {
		return nil, fmt.Errorf("source_account and destination_account must differ")
	}
	if amount.IsZero() || amount.IsNegative() {
		return nil, fmt.Errorf("amount must be > 0")
	}

	outTx := &models.Transaction{
		Date:         date,
		Type:         "transfer_out",
		Asset:        asset,
		Account:      source,
		Quantity:     amount,
		PriceLocal:   decimal.NewFromInt(1),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
	}
	inTx := &models.Transaction{
		Date:         date,
		Type:         "transfer_in",
		Asset:        asset,
		Account:      dest,
		Quantity:     amount,
		PriceLocal:   decimal.NewFromInt(1),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromInt(1),
		InternalFlow: func() *bool { b := true; return &b }(),
	}
	if counterparty != "" {
		outTx.Counterparty = &counterparty
		inTx.Counterparty = &counterparty
	}
	if note != "" {
		outTx.Note = &note
		inTx.Note = &note
	}

	// Create atomically in one linked action
	created, err := s.transactionService.CreateTransactionsBatch(ctx, []*models.Transaction{outTx, inTx}, "action")
	if err != nil {
		return nil, err
	}
	return &models.ActionResponse{Action: req.Action, Transactions: created, ExecutedAt: time.Now()}, nil
}
