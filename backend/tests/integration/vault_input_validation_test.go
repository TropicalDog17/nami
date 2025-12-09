package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestVault_DepositValidation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed an investment via stake
	seed := makeStakeTx(time.Now(), "USDT", "Kyberswap", 10, 1)
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

	// Bad JSON
	rBad := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/deposit", bytes.NewReader([]byte("{")))
	wBad := httptest.NewRecorder()
	vaultHandler.HandleVault(wBad, rBad)
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad JSON, got %d", wBad.Code)
	}

	// quantity = 0 should now be allowed (empty deposit)
	dep := map[string]interface{}{"quantity": 0, "cost": 0}
	depJSON, _ := json.Marshal(dep)
	rQty := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/deposit", bytes.NewReader(depJSON))
	wQty := httptest.NewRecorder()
	vaultHandler.HandleVault(wQty, rQty)
	if wQty.Code != http.StatusCreated {
		t.Fatalf("expected 201 for qty=0 (empty deposit), got %d body=%s", wQty.Code, wQty.Body.String())
	}

	// cost < 0
	dep = map[string]interface{}{"quantity": 1, "cost": -1}
	depJSON, _ = json.Marshal(dep)
	rCost := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/deposit", bytes.NewReader(depJSON))
	wCost := httptest.NewRecorder()
	vaultHandler.HandleVault(wCost, rCost)
	if wCost.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for cost<0, got %d body=%s", wCost.Code, wCost.Body.String())
	}

	// not found vault id
	dep = map[string]interface{}{"quantity": 1, "cost": 1}
	depJSON, _ = json.Marshal(dep)
	rNF := httptest.NewRequest(http.MethodPost, "/api/vaults/not-found-id/deposit", bytes.NewReader(depJSON))
	wNF := httptest.NewRecorder()
	vaultHandler.HandleVault(wNF, rNF)
	if wNF.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for not found, got %d", wNF.Code)
	}
}

func TestVault_WithdrawValidation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed an investment via stake
	seed := makeStakeTx(time.Now(), "BTC", "Kyberswap", 5, 2)
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

	// Bad JSON
	rBad := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader([]byte("{")))
	wBad := httptest.NewRecorder()
	vaultHandler.HandleVault(wBad, rBad)
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad JSON, got %d", wBad.Code)
	}

	// quantity <= 0
	wd := map[string]interface{}{"quantity": 0, "value": 0}
	wdJSON, _ := json.Marshal(wd)
	rQty := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wdJSON))
	wQty := httptest.NewRecorder()
	vaultHandler.HandleVault(wQty, rQty)
	if wQty.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for qty<=0, got %d body=%s", wQty.Code, wQty.Body.String())
	}

	// value < 0
	wd = map[string]interface{}{"quantity": 1, "value": -1}
	wdJSON, _ = json.Marshal(wd)
	rVal := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wdJSON))
	wVal := httptest.NewRecorder()
	vaultHandler.HandleVault(wVal, rVal)
	if wVal.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for value<0, got %d body=%s", wVal.Code, wVal.Body.String())
	}

	// not found vault id
	wd = map[string]interface{}{"quantity": 1, "value": 1}
	wdJSON, _ = json.Marshal(wd)
	rNF := httptest.NewRequest(http.MethodPost, "/api/vaults/not-found-id/withdraw", bytes.NewReader(wdJSON))
	wNF := httptest.NewRecorder()
	vaultHandler.HandleVault(wNF, rNF)
	if wNF.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for not found, got %d", wNF.Code)
	}

	// valid minimal withdrawal should succeed (created)
	wd = map[string]interface{}{"quantity": 1, "value": 1}
	wdJSON, _ = json.Marshal(wd)
	rOK := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wdJSON))
	wOK := httptest.NewRecorder()
	vaultHandler.HandleVault(wOK, rOK)
	if wOK.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid withdrawal, got %d body=%s", wOK.Code, wOK.Body.String())
	}
}

func TestVault_EmptyVaultCreation(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	tests := []struct {
		name        string
		asset       string
		account     string
		depositQty  float64
		depositCost float64
		date        string
		expectCode  int
		expectError string
	}{
		{
			name:        "valid empty vault (depositQty=0, depositCost=0)",
			asset:       "BTC",
			account:     "Investment Vault",
			depositQty:  0,
			depositCost: 0,
			date:        "2025-01-15",
			expectCode:  http.StatusCreated,
			expectError: "",
		},
		{
			name:        "valid vault with positive deposit",
			asset:       "ETH",
			account:     "Investment Vault",
			depositQty:  10,
			depositCost: 2000,
			date:        "2025-01-15",
			expectCode:  http.StatusCreated,
			expectError: "",
		},
		{
			name:        "valid vault with depositQty > 0 and depositCost = 0",
			asset:       "USDT",
			account:     "Investment Vault",
			depositQty:  100,
			depositCost: 0,
			date:        "2025-01-15",
			expectCode:  http.StatusCreated,
			expectError: "",
		},
		{
			name:        "reject negative depositQty",
			asset:       "BTC",
			account:     "Investment Vault",
			depositQty:  -1,
			depositCost: 0,
			date:        "2025-01-15",
			expectCode:  http.StatusBadRequest,
			expectError: "depositQty (>=0), and depositCost (>=0) are required",
		},
		{
			name:        "reject negative depositCost",
			asset:       "BTC",
			account:     "Investment Vault",
			depositQty:  0,
			depositCost: -100,
			date:        "2025-01-15",
			expectCode:  http.StatusBadRequest,
			expectError: "depositQty (>=0), and depositCost (>=0) are required",
		},
		{
			name:        "reject empty asset",
			asset:       "",
			account:     "Investment Vault",
			depositQty:  0,
			depositCost: 0,
			date:        "2025-01-15",
			expectCode:  http.StatusBadRequest,
			expectError: "depositQty (>=0), and depositCost (>=0) are required",
		},
		{
			name:        "reject empty account",
			asset:       "BTC",
			account:     "",
			depositQty:  0,
			depositCost: 0,
			date:        "2025-01-15",
			expectCode:  http.StatusBadRequest,
			expectError: "depositQty (>=0), and depositCost (>=0) are required",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body := map[string]interface{}{
				"asset":       tc.asset,
				"account":     tc.account,
				"depositQty":  tc.depositQty,
				"depositCost": tc.depositCost,
				"date":        tc.date,
			}
			bodyJSON, _ := json.Marshal(body)

			req := httptest.NewRequest(http.MethodPost, "/api/vaults", bytes.NewReader(bodyJSON))
			w := httptest.NewRecorder()
			vaultHandler.HandleVaults(w, req)

			if w.Code != tc.expectCode {
				t.Fatalf("expected status %d, got %d, body=%s", tc.expectCode, w.Code, w.Body.String())
			}

			if tc.expectCode == http.StatusBadRequest && tc.expectError != "" {
				responseBody := w.Body.String()
				if !contains(responseBody, tc.expectError) {
					t.Fatalf("expected error message to contain '%s', got '%s'", tc.expectError, responseBody)
				}
			}

			if tc.expectCode == http.StatusCreated {
				var created models.Investment
				if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
					t.Fatalf("failed to decode response: %v", err)
				}

				// Verify the created vault has correct values
				if created.Asset != tc.asset {
					t.Fatalf("expected asset '%s', got '%s'", tc.asset, created.Asset)
				}

				if created.Account != tc.account {
					t.Fatalf("expected account '%s', got '%s'", tc.account, created.Account)
				}

				expectedQty := decimal.NewFromFloat(tc.depositQty)
				if !created.DepositQty.Equal(expectedQty) {
					t.Fatalf("expected depositQty %s, got %s", expectedQty.String(), created.DepositQty.String())
				}

				expectedCost := decimal.NewFromFloat(tc.depositCost)
				if !created.DepositCost.Equal(expectedCost) {
					t.Fatalf("expected depositCost %s, got %s", expectedCost.String(), created.DepositCost.String())
				}

				// Verify that the vault was created successfully and can be retrieved
				reqGet := httptest.NewRequest(http.MethodGet, "/api/vaults/"+created.ID, nil)
				wGet := httptest.NewRecorder()
				vaultHandler.HandleVault(wGet, reqGet)

				if wGet.Code != http.StatusOK {
					t.Fatalf("failed to retrieve created vault, got status %d, body=%s", wGet.Code, wGet.Body.String())
				}

				var retrieved models.Investment
				if err := json.Unmarshal(wGet.Body.Bytes(), &retrieved); err != nil {
					t.Fatalf("failed to decode retrieved vault: %v", err)
				}

				if retrieved.ID != created.ID {
					t.Fatalf("retrieved vault ID mismatch, expected %s, got %s", created.ID, retrieved.ID)
				}
			}
		})
	}
}

// Helper function to check if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > len(substr) && containsString(s, substr)))
}

func containsString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestVault_RouteMisuseAndUnknownActions(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// POST on GET-only route (now allowed for creation, so expects 400 Bad Request due to nil body)
	r := httptest.NewRequest(http.MethodPost, "/api/vaults", nil)
	w := httptest.NewRecorder()
	vaultHandler.HandleVaults(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for POST /api/vaults with nil body, got %d", w.Code)
	}

	// GET on vault action route
	r2 := httptest.NewRequest(http.MethodGet, "/api/vaults/some-id/withdraw", nil)
	w2 := httptest.NewRecorder()
	vaultHandler.HandleVault(w2, r2)
	if w2.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for GET on action path, got %d", w2.Code)
	}

	// Unknown action
	r3 := httptest.NewRequest(http.MethodPost, "/api/vaults/some-id/unknown", nil)
	w3 := httptest.NewRecorder()
	vaultHandler.HandleVault(w3, r3)
	if w3.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown action, got %d", w3.Code)
	}
}

func TestVault_EndZeroROI_APRAbsent(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Stake 10 @ $1
	seed := makeStakeTx(time.Now().Add(-24*time.Hour), "USDT", "Kyberswap", 10, 1)
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

	// Withdraw all at same total value (no PnL)
	wBody := map[string]interface{}{"quantity": 10, "value": 10}
	wJSON, _ := json.Marshal(wBody)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}

	// End vault
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}
	var ended map[string]interface{}
	if err := json.Unmarshal(wEnd.Body.Bytes(), &ended); err != nil {
		t.Fatalf("decode end: %v", err)
	}

	// PnL should be zero; apr_percent should be present (APRPercent computed only if ROI != 0), so nil here
	pnl := getDecimal(ended["pnl"]).InexactFloat64()
	if pnl != 0 {
		t.Fatalf("expected zero pnl, got %v", pnl)
	}
	roi := getDecimal(ended["pnl_percent"]).InexactFloat64()
	if roi != 0 {
		t.Fatalf("expected zero roi, got %v", roi)
	}
	if ended["apr_percent"] != nil {
		t.Fatalf("expected apr_percent omitted when ROI is zero")
	}
}

func TestVault_ListFilter_IsOpen(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed two investments
	// Open one (no withdraw)
	seedOpen := makeStakeTx(time.Now().Add(-24*time.Hour), "USDT", "Kyberswap", 10, 1)
	b1, _ := json.Marshal(seedOpen)
	r1 := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b1))
	w1 := httptest.NewRecorder()
	invHandler.HandleStake(w1, r1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("stake open status=%d body=%s", w1.Code, w1.Body.String())
	}

	// Closed one (withdraw all then end)
	seedClosed := makeStakeTx(time.Now().Add(-24*time.Hour), "BTC", "Kyberswap", 5, 2)
	b2, _ := json.Marshal(seedClosed)
	r2 := httptest.NewRequest(http.MethodPost, "/api/investments/stake", bytes.NewReader(b2))
	w2 := httptest.NewRecorder()
	invHandler.HandleStake(w2, r2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("stake closed status=%d body=%s", w2.Code, w2.Body.String())
	}
	var closedInv models.Investment
	if err := json.Unmarshal(w2.Body.Bytes(), &closedInv); err != nil {
		t.Fatalf("decode closed stake: %v", err)
	}
	wd := map[string]interface{}{"quantity": 5, "value": 10}
	wdJSON, _ := json.Marshal(wd)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+closedInv.ID+"/withdraw", bytes.NewReader(wdJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+closedInv.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}

	// List open
	rOpen := httptest.NewRequest(http.MethodGet, "/api/vaults?is_open=true", nil)
	wOpen := httptest.NewRecorder()
	vaultHandler.HandleVaults(wOpen, rOpen)
	if wOpen.Code != http.StatusOK {
		t.Fatalf("list open status=%d body=%s", wOpen.Code, wOpen.Body.String())
	}
	var openList []map[string]interface{}
	if err := json.Unmarshal(wOpen.Body.Bytes(), &openList); err != nil {
		t.Fatalf("decode open list: %v", err)
	}
	if len(openList) == 0 {
		t.Fatalf("expected at least one open vault")
	}
	// All should have is_open true
	for _, v := range openList {
		if v["is_open"] != true {
			t.Fatalf("expected is_open=true in open list")
		}
	}

	// List closed
	rClosed := httptest.NewRequest(http.MethodGet, "/api/vaults?is_open=false", nil)
	wClosed := httptest.NewRecorder()
	vaultHandler.HandleVaults(wClosed, rClosed)
	if wClosed.Code != http.StatusOK {
		t.Fatalf("list closed status=%d body=%s", wClosed.Code, wClosed.Body.String())
	}
	var closedList []map[string]interface{}
	if err := json.Unmarshal(wClosed.Body.Bytes(), &closedList); err != nil {
		t.Fatalf("decode closed list: %v", err)
	}
	if len(closedList) == 0 {
		t.Fatalf("expected at least one closed vault")
	}
	for _, v := range closedList {
		if v["is_open"] != false {
			t.Fatalf("expected is_open=false in closed list")
		}
	}
}

func TestVault_OverWithdraw_CorrectPnL(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Stake 10 @ $1, then deposit +5 @ $1 (total cost 15)
	seed := makeStakeTx(time.Now().Add(-48*time.Hour), "USDT", "Kyberswap", 10, 1)
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

	dep := map[string]interface{}{"quantity": 5, "cost": 5}
	depJSON, _ := json.Marshal(dep)
	rDep := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/deposit", bytes.NewReader(depJSON))
	wDep := httptest.NewRecorder()
	vaultHandler.HandleVault(wDep, rDep)
	if wDep.Code != http.StatusCreated {
		t.Fatalf("deposit status=%d body=%s", wDep.Code, wDep.Body.String())
	}

	// Over-withdraw 20 @ $1.10 (value = 22.0) => cost basis uses total deposit cost (15) => PnL = 7
	wd := map[string]interface{}{"quantity": 20, "value": 22.0}
	wdJSON, _ := json.Marshal(wd)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wdJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}

	// End vault
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}
	var ended map[string]interface{}
	if err := json.Unmarshal(wEnd.Body.Bytes(), &ended); err != nil {
		t.Fatalf("decode end: %v", err)
	}

	pnl := getDecimal(ended["pnl"]).InexactFloat64()
	if pnl < 6.99 || pnl > 7.01 {
		t.Fatalf("expected pnl ~= 7.0, got %v", pnl)
	}
}

func TestVaultPnLAndROI_ComputesCorrectly_OnFullExit(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// Seed: deposit 10 @ $1 (USD) two days ago
	seed := makeStakeTx(time.Now().Add(-48*time.Hour), "USDT", "Kyberswap", 10, 1)
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

	// Add second deposit 5 @ $1
	depBody := map[string]interface{}{"quantity": 5, "cost": 5}
	depJSON, _ := json.Marshal(depBody)
	rDep := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/deposit", bytes.NewReader(depJSON))
	wDep := httptest.NewRecorder()
	vaultHandler.HandleVault(wDep, rDep)
	if wDep.Code != http.StatusCreated {
		t.Fatalf("deposit status=%d body=%s", wDep.Code, wDep.Body.String())
	}

	// Withdraw all 15 @ $1.10 (value = 16.5, cost = 15, PnL = 1.5, ROI = 10%)
	wBody := map[string]interface{}{"quantity": 15, "value": 16.5}
	wJSON, _ := json.Marshal(wBody)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}

	// End vault to finalize and compute ROI/APR
	rEnd := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/end", nil)
	wEnd := httptest.NewRecorder()
	vaultHandler.HandleVault(wEnd, rEnd)
	if wEnd.Code != http.StatusOK {
		t.Fatalf("end status=%d body=%s", wEnd.Code, wEnd.Body.String())
	}
	var ended map[string]interface{}
	if err := json.Unmarshal(wEnd.Body.Bytes(), &ended); err != nil {
		t.Fatalf("decode end: %v", err)
	}

	if ended["vault_status"] != "ended" {
		t.Fatalf("expected ended status, got %v", ended["vault_status"])
	}

	pnl := getDecimal(ended["pnl"]).InexactFloat64()
	if pnl < 1.49 || pnl > 1.51 {
		t.Fatalf("expected pnl ~= 1.5, got %v", pnl)
	}

	roi := getDecimal(ended["pnl_percent"]).InexactFloat64()
	if roi < 9.9 || roi > 10.1 {
		t.Fatalf("expected roi ~= 10.0, got %v", roi)
	}

	if ended["apr_percent"] == nil {
		t.Fatalf("expected apr_percent present on ended vault")
	}
}

func TestVaultPnL_RemainsZero_OnPartialWhileOpen(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	txRepo := repositories.NewTransactionRepository(tdb.database)
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txRepo)
	txSvc := services.NewTransactionService(tdb.database)
	invHandler := handlers.NewInvestmentHandler(invSvc)
	vaultHandler := handlers.NewVaultHandler(invSvc, txSvc, nil)

	// One deposit 10 @ $2
	seed := makeStakeTx(time.Now().Add(-24*time.Hour), "BTC", "Kyberswap", 10, 2)
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

	// Withdraw partial 3 @ $3 (remain open)
	wBody := map[string]interface{}{"quantity": 3, "value": 9}
	wJSON, _ := json.Marshal(wBody)
	rW := httptest.NewRequest(http.MethodPost, "/api/vaults/"+created.ID+"/withdraw", bytes.NewReader(wJSON))
	wW := httptest.NewRecorder()
	vaultHandler.HandleVault(wW, rW)
	if wW.Code != http.StatusCreated {
		t.Fatalf("withdraw status=%d body=%s", wW.Code, wW.Body.String())
	}

	// Get vault; PnL should be zero while open (partial exit)
	rGet := httptest.NewRequest(http.MethodGet, "/api/vaults/"+created.ID, nil)
	wGet := httptest.NewRecorder()
	vaultHandler.HandleVault(wGet, rGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", wGet.Code, wGet.Body.String())
	}
	var v map[string]interface{}
	if err := json.Unmarshal(wGet.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode vault: %v", err)
	}
	if !getDecimal(v["pnl"]).Equal(decimal.Zero) || !getDecimal(v["pnl_percent"]).Equal(decimal.Zero) {
		t.Fatalf("expected zero pnl while open, got pnl=%v, roi=%v", v["pnl"], v["pnl_percent"])
	}
}


