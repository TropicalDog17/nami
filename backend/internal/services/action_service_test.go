package services

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// Covers regression: stake/unstake should mark internal transfers and yield zero cash flow
func TestActionService_Stake_InternalTransfersZeroCashflow(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := NewTransactionService(tdb.database)
	svc := NewActionService(tdb.database, txService)

	req := &models.ActionRequest{
		Action: models.ActionStake,
		Params: map[string]interface{}{
			"date":               time.Now().Format("2006-01-02"),
			"source_account":     "Binance Spot",
			"investment_account": "Binance Earn",
			"asset":              "USDT",
			"amount":             1000.0,
			"fee_percent":        0.8, // expect deposit of 992 and separate fee
		},
	}

	resp, err := svc.Perform(ctx, req)
	if err != nil {
		t.Fatalf("stake action failed: %v", err)
	}
	if resp == nil || len(resp.Transactions) < 2 {
		t.Fatalf("expected at least 2 transactions from stake, got %d", len(resp.Transactions))
	}

	var transferOut *models.Transaction
	var deposit *models.Transaction
	var fee *models.Transaction
	for _, tx := range resp.Transactions {
		switch tx.Type {
		case "transfer_out":
			transferOut = tx
		case "deposit":
			deposit = tx
		case "fee":
			fee = tx
		}
	}

	if transferOut == nil || deposit == nil {
		t.Fatalf("missing transfer_out or deposit in stake action result")
	}

	// Transfer out should be internal and have zero cash flow
	if transferOut.InternalFlow == nil || !*transferOut.InternalFlow {
		t.Fatalf("expected transfer_out to be marked internal")
	}
	if !transferOut.CashFlowUSD.Equal(decimal.Zero) || !transferOut.CashFlowVND.Equal(decimal.Zero) {
		t.Fatalf("expected transfer_out cashflow to be zero, got USD=%s VND=%s", transferOut.CashFlowUSD.String(), transferOut.CashFlowVND.String())
	}

	// Deposit should be internal and also zero cash flow
	if deposit.InternalFlow == nil || !*deposit.InternalFlow {
		t.Fatalf("expected deposit to be marked internal")
	}
	if !deposit.CashFlowUSD.Equal(decimal.Zero) || !deposit.CashFlowVND.Equal(decimal.Zero) {
		t.Fatalf("expected deposit cashflow to be zero, got USD=%s VND=%s", deposit.CashFlowUSD.String(), deposit.CashFlowVND.String())
	}

	// Optional fee should be present and negative cash flow
	if fee == nil {
		t.Fatalf("expected a fee transaction to be created")
	}
	if !fee.CashFlowUSD.IsNegative() || !fee.CashFlowVND.IsNegative() {
		t.Fatalf("expected fee cashflow negative, got USD=%s VND=%s", fee.CashFlowUSD.String(), fee.CashFlowVND.String())
	}
}

func TestActionService_Unstake_InternalTransfersZeroCashflow(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := NewTransactionService(tdb.database)
	svc := NewActionService(tdb.database, txService)

	req := &models.ActionRequest{
		Action: models.ActionUnstake,
		Params: map[string]interface{}{
			"date":                time.Now().Format("2006-01-02"),
			"investment_account":  "Binance Earn",
			"destination_account": "Binance Spot",
			"asset":               "USDT",
			"amount":              500.0,
		},
	}

	resp, err := svc.Perform(ctx, req)
	if err != nil {
		t.Fatalf("unstake action failed: %v", err)
	}
	if resp == nil || len(resp.Transactions) != 2 {
		t.Fatalf("expected 2 transactions from unstake, got %d", len(resp.Transactions))
	}

	var withdraw *models.Transaction
	var transferIn *models.Transaction
	for _, tx := range resp.Transactions {
		if tx.Type == "withdraw" {
			withdraw = tx
		}
		if tx.Type == "transfer_in" {
			transferIn = tx
		}
	}
	if withdraw == nil || transferIn == nil {
		t.Fatalf("missing withdraw or transfer_in in unstake action result")
	}

	// Both should be marked internal
	if withdraw.InternalFlow == nil || !*withdraw.InternalFlow {
		t.Fatalf("expected withdraw to be marked internal")
	}
	if transferIn.InternalFlow == nil || !*transferIn.InternalFlow {
		t.Fatalf("expected transfer_in to be marked internal")
	}
	// transfer_in should have zero cash flow due to internal flag
	if !transferIn.CashFlowUSD.Equal(decimal.Zero) || !transferIn.CashFlowVND.Equal(decimal.Zero) {
		t.Fatalf("expected transfer_in cashflow to be zero, got USD=%s VND=%s", transferIn.CashFlowUSD.String(), transferIn.CashFlowVND.String())
	}
}
