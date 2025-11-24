package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestActionService_InternalTransfer(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	txService := services.NewTransactionService(tdb.database)
	svc := services.NewActionService(tdb.database, txService)

	params := map[string]interface{}{
		"date":                time.Now().Format("2006-01-02"),
		"source_account":      "Bank A",
		"destination_account": "Bank B",
		"asset":               "USD",
		"amount":              100.0,
		"note":                "Moving funds",
	}

	req := &models.ActionRequest{
		Action: models.ActionInternalTransfer,
		Params: params,
	}

	resp, err := svc.Perform(ctx, req)
	if err != nil {
		t.Fatalf("internal transfer failed: %v", err)
	}

	if len(resp.Transactions) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(resp.Transactions))
	}

	var outTx, inTx *models.Transaction
	for _, tx := range resp.Transactions {
		if tx.Type == "transfer_out" {
			outTx = tx
		} else if tx.Type == "transfer_in" {
			inTx = tx
		}
	}

	if outTx == nil || inTx == nil {
		t.Fatalf("expected transfer_out and transfer_in transactions")
	}

	// Verify details
	if outTx.Account != "Bank A" {
		t.Errorf("expected source account Bank A, got %s", outTx.Account)
	}
	if inTx.Account != "Bank B" {
		t.Errorf("expected dest account Bank B, got %s", inTx.Account)
	}
	if !outTx.Quantity.Equal(decimal.NewFromFloat(100)) {
		t.Errorf("expected quantity 100, got %s", outTx.Quantity.String())
	}
	if outTx.InternalFlow == nil || !*outTx.InternalFlow {
		t.Errorf("expected transfer_out to be internal flow")
	}
	if inTx.InternalFlow == nil || !*inTx.InternalFlow {
		t.Errorf("expected transfer_in to be internal flow")
	}
	if outTx.Note == nil || *outTx.Note != "Moving funds" {
		t.Errorf("expected note 'Moving funds', got %v", outTx.Note)
	}
}
