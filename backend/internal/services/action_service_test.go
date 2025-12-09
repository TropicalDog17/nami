package services

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

func TestActionService_PerformSpend(t *testing.T) {
	ctx := context.Background()
	mts := &mockTransactionService{}
	s := NewActionService(&db.DB{}, mts)

	req := &models.ActionRequest{
		Action: models.ActionSpendVND,
		Params: map[string]interface{}{
			"date":         time.Now().Format("2006-01-02"),
			"account":      "Bank",
			"vnd_amount":   120000,
			"counterparty": "McDo",
		},
	}
	resp, err := s.Perform(ctx, req)
	if err != nil {
		t.Fatalf("perform spend error: %v", err)
	}
	if resp == nil || len(resp.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %#v", resp)
	}
	if len(mts.created) != 1 {
		t.Fatalf("expected CreateTransaction to be called once")
	}
}

func TestActionService_PerformP2PBuy(t *testing.T) {
	ctx := context.Background()
	mts := &mockTransactionService{}
	s := NewActionService(&db.DB{}, mts)

	req := &models.ActionRequest{
		Action: models.ActionP2PBuyUSDT,
		Params: map[string]interface{}{
			"date":               time.Now().Format("2006-01-02"),
			"exchange_account":   "Binance Spot",
			"bank_account":       "Bank",
			"price_vnd_per_usdt": 24500,
			"vnd_amount":         2450000,
			"counterparty":       "OTC",
		},
	}
	resp, err := s.Perform(ctx, req)
	if err != nil {
		t.Fatalf("perform p2p buy error: %v", err)
	}
	if resp == nil || len(resp.Transactions) < 2 {
		t.Fatalf("expected >=2 transactions, got %#v", resp)
	}
	if len(mts.batchCreated) == 0 {
		t.Fatalf("expected CreateTransactionsBatch to be called")
	}
}

func TestActionService_PerformSpotBuy_AutoPriceAndFees(t *testing.T) {
	ctx := context.Background()
	mts := &mockTransactionService{}
	priceSvc := &mockAssetPriceService{price: decimal.NewFromFloat(50000)}
	// include price service to allow auto price
	s := NewActionServiceWithPrices(&db.DB{}, mts, priceSvc)

	req := &models.ActionRequest{
		Action: models.ActionSpotBuy,
		Params: map[string]interface{}{
			"date":             time.Now().Format("2006-01-02"),
			"exchange_account": "Binance Spot",
			"base_asset":       "BTC",
			"quote_asset":      "USDT",
			"quantity":         0.01,
			"fee_percent":      0.1,
		},
	}
	resp, err := s.Perform(ctx, req)
	if err != nil {
		t.Fatalf("perform spot buy error: %v", err)
	}
	if resp == nil || len(resp.Transactions) < 2 {
		t.Fatalf("expected at least 2 transactions (buy+sell), got %#v", resp)
	}
}

func TestActionService_PerformInternalTransferValidation(t *testing.T) {
	ctx := context.Background()
	mts := &mockTransactionService{}
	s := NewActionService(&db.DB{}, mts)

	req := &models.ActionRequest{
		Action: models.ActionInternalTransfer,
		Params: map[string]interface{}{
			"date":                time.Now().Format("2006-01-02"),
			"source_account":      "Wallet",
			"destination_account": "Wallet",
			"asset":               "USDT",
			"amount":              10,
		},
	}
	if _, err := s.Perform(ctx, req); err == nil {
		t.Fatalf("expected validation error for same source/destination accounts")
	}
}

func TestActionService_PerformBorrow(t *testing.T) {
	ctx := context.Background()
	mts := &mockTransactionService{}
	s := NewActionService(&db.DB{}, mts)

	req := &models.ActionRequest{
		Action: models.ActionBorrow,
		Params: map[string]interface{}{
			"date":    time.Now().Format("2006-01-02"),
			"account": "Margin",
			"asset":   "USDT",
			"amount":  100,
		},
	}
	resp, err := s.Perform(ctx, req)
	if err != nil {
		t.Fatalf("perform borrow error: %v", err)
	}
	if resp == nil || len(resp.Transactions) != 1 {
		t.Fatalf("expected single transaction, got %#v", resp)
	}
}
