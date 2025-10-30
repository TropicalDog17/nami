package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// Regression tests for vault end and delete flows

func TestVault_End_ClosesInvestment(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc)

	// Seed: create a stake investment
	seed := makeStakeTx(time.Now().Add(-24*time.Hour), "USDT", "Vault", 10, 1)
	b, _ := json.Marshal(seed)
	req := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	invHandler.HandleStake(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("stake create status=%d body=%s", rr.Code, rr.Body.String())
	}
	var created models.Investment
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode stake: %v", err)
	}

	// End vault
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}

	// Validate response shows closed status
	var ended map[string]interface{}
	if err := json.Unmarshal(wEnd.Body.Bytes(), &ended); err != nil {
		t.Fatalf("decode end: %v", err)
	}
	// is_open should be false and status should be ended
	if open, ok := ended["is_open"].(bool); !ok || open {
		t.Fatalf("expected is_open=false, got %v", ended["is_open"])
	}
	if status, _ := ended["vault_status"].(string); status != "ended" {
		t.Fatalf("expected vault_status=ended, got %v", ended["vault_status"])
	}
}

func TestVault_Delete_RemovesInvestmentAndTransactions(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc)
	txService := services.NewTransactionService(tdb.database)

	// Seed: create a stake investment
	seed := makeStakeTx(time.Now(), "BTC", "Vault", 5, 2)
	b, _ := json.Marshal(seed)
	req := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	invHandler.HandleStake(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("stake create status=%d body=%s", rr.Code, rr.Body.String())
	}
	var created models.Investment
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode stake: %v", err)
	}

	// Ensure at least one transaction exists for this investment
	filter := &models.TransactionFilter{InvestmentID: &created.ID}
	txs, err := txService.ListTransactions(ctx, filter)
	if err != nil {
		t.Fatalf("list transactions failed: %v", err)
	}
	if len(txs) == 0 {
		t.Fatalf("expected transactions for investment before delete")
	}

	// DELETE the vault
	rDel := httptest.NewRequest(http.MethodDelete, "/api/vaults/"+created.ID, nil)
	wDel := httptest.NewRecorder()
	vaultHandler.HandleVault(wDel, rDel)
	if wDel.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%s", wDel.Code, wDel.Body.String())
	}

	// GET should now return 404
	rGet := httptest.NewRequest(http.MethodGet, "/api/vaults/"+created.ID, nil)
	wGet := httptest.NewRecorder()
	vaultHandler.HandleVault(wGet, rGet)
	assert.Equal(t, http.StatusNotFound, wGet.Code, "expected 404 after deletion")

	// Transactions linked to this investment should be removed
	txsAfter, err := txService.ListTransactions(ctx, filter)
	if err != nil {
		t.Fatalf("list transactions after delete failed: %v", err)
	}
	if len(txsAfter) != 0 {
		t.Fatalf("expected 0 transactions after delete, got %d", len(txsAfter))
	}
}
