package services

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
)

func TestAIPendingService_CreateSetsPending(t *testing.T) {
	repo := &mockAIPendingRepo{}
	svc := NewAIPendingService(&db.DB{}, repo, &mockActionService{})
	a := &models.AIPendingAction{Source: "telegram_text", RawInput: "hello"}
	if err := svc.Create(context.Background(), a); err != nil {
		t.Fatalf("create error: %v", err)
	}
	if repo.item == nil || repo.item.Status != "pending" {
		t.Fatalf("expected status pending, got %#v", repo.item)
	}
}

func TestAIPendingService_AcceptHappyPath(t *testing.T) {
	repo := &mockAIPendingRepo{item: &models.AIPendingAction{ID: "id1", Status: "pending", Source: "telegram_text", RawInput: "hi"}}
	svc := NewAIPendingService(&db.DB{}, repo, &mockActionService{})
	// Provide a valid action JSON
	req := models.ActionRequest{Action: models.ActionSpendVND, Params: map[string]interface{}{"account": "Bank", "vnd_amount": 100}}
	b, _ := json.Marshal(req)
	repo.item.ActionJSON = b
	resp, err := svc.Accept(context.Background(), "id1")
	if err != nil {
		t.Fatalf("accept error: %v", err)
	}
	if resp == nil || len(resp.Transactions) != 1 {
		t.Fatalf("unexpected response: %#v", resp)
	}
	if !repo.setAcceptedCalled || repo.item.Status != "accepted" {
		t.Fatalf("expected SetAccepted to be called and status updated")
	}
}

func TestAIPendingService_AcceptErrors(t *testing.T) {
	repo := &mockAIPendingRepo{item: &models.AIPendingAction{ID: "id1", Status: "accepted", Source: "telegram_text", RawInput: "hi"}}
	svc := NewAIPendingService(&db.DB{}, repo, &mockActionService{})
	if _, err := svc.Accept(context.Background(), "id1"); err == nil {
		t.Fatalf("expected error when status != pending")
	}
	// missing action json
	repo.item.Status = "pending"
	repo.item.ActionJSON = nil
	if _, err := svc.Accept(context.Background(), "id1"); err == nil {
		t.Fatalf("expected error for missing action_json")
	}
	// invalid json
	repo.item.ActionJSON = []byte("{")
	if _, err := svc.Accept(context.Background(), "id1"); err == nil {
		t.Fatalf("expected error for invalid json")
	}
}

func TestAIPendingService_Reject(t *testing.T) {
	repo := &mockAIPendingRepo{item: &models.AIPendingAction{ID: "id1", Status: "pending", Source: "telegram_text", RawInput: "hi"}}
	svc := NewAIPendingService(&db.DB{}, repo, &mockActionService{})
	if err := svc.Reject(context.Background(), "id1", "bad"); err != nil {
		t.Fatalf("reject error: %v", err)
	}
	if !repo.setRejectedCalled || repo.item.Status != "rejected" {
		t.Fatalf("expected SetRejected called and status updated")
	}
}

// compile-time checks that mocks satisfy interfaces
var _ TransactionService = (*mockTransactionService)(nil)
var _ LinkService = (*mockLinkService)(nil)
var _ AssetPriceService = (*mockAssetPriceService)(nil)
var _ InvestmentService = (*mockInvestmentService)(nil)
var _ repositories.AIPendingActionRepository = (*mockAIPendingRepo)(nil)
var _ ActionService = (*mockActionService)(nil)

// prevent unused import of decimal in this file
var _ = decimal.Zero
