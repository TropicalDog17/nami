package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// setupVaultAPITestServer creates a test server with vault handlers
func setupVaultAPITestServer(t *testing.T) (*httptest.Server, services.InvestmentService, func()) {
	tdb := SetupTestDB(t)

	// Initialize services
	invRepo := repositories.NewInvestmentRepository(tdb.database)
	txSvc := services.NewTransactionService(tdb.database)
	invSvc := services.NewInvestmentService(invRepo, txSvc)

	// Initialize handler
	investmentHandler := handlers.NewInvestmentHandler(invSvc)

	// Create test server using gorilla/mux
	router := mux.NewRouter()

	// Register vault routes
	router.HandleFunc("/api/vaults", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			investmentHandler.HandleGetActiveVaults(w, r)
		} else if r.Method == http.MethodPost {
			investmentHandler.HandleCreateVault(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}).Methods("GET", "POST")

	// Individual vault routes
	router.HandleFunc("/api/vaults/{name}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			investmentHandler.HandleGetVaultByName(w, r)
		} else if r.Method == http.MethodDelete {
			investmentHandler.HandleDeleteVault(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}).Methods("GET", "DELETE")

	// Vault action routes
	router.HandleFunc("/api/vaults/{name}/deposit", investmentHandler.HandleDepositToVault).Methods("POST")
	router.HandleFunc("/api/vaults/{name}/withdraw", investmentHandler.HandleWithdrawFromVault).Methods("POST")
	router.HandleFunc("/api/vaults/{name}/end", investmentHandler.HandleEndVault).Methods("POST")

	server := httptest.NewServer(router)

	cleanup := func() {
		server.Close()
		tdb.cleanup(t)
	}

	return server, invSvc, cleanup
}

func TestVaultAPI_CreateVault(t *testing.T) {
	server, _, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	requestBody := `{
		"name": "Test Vault",
		"asset": "BTC",
		"account": "Binance Spot",
		"initialDeposit": 0.1
	}`

	resp, err := http.Post(server.URL+"/api/vaults", "application/json", bytes.NewBufferString(requestBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	var vault map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vault)
	require.NoError(t, err)

	// Test with actual field names from JSON response
	assert.Equal(t, "Test Vault", vault["vault_name"])
	assert.Equal(t, "BTC", vault["asset"])
	assert.Equal(t, true, vault["is_vault"])
}

func TestVaultAPI_GetActiveVaults_Empty(t *testing.T) {
	server, _, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	resp, err := http.Get(server.URL + "/api/vaults")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vaults []interface{}
	err = json.NewDecoder(resp.Body).Decode(&vaults)
	require.NoError(t, err)

	assert.Empty(t, vaults)
}

func TestVaultAPI_GetActiveVaults_WithData(t *testing.T) {
	server, invSvc, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	// Create a test vault
	_, err := invSvc.CreateVault(context.Background(), "Test Vault", "USDT", "Binance Spot", decimal.NewFromInt(1000), "long-term")
	require.NoError(t, err)

	// Test getting active vaults
	resp, err := http.Get(server.URL + "/api/vaults")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vaults []map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vaults)
	require.NoError(t, err)

	assert.Len(t, vaults, 1)
	assert.Equal(t, "Test Vault", vaults[0]["vault_name"])
	assert.Equal(t, "USDT", vaults[0]["asset"])
}

func TestVaultAPI_GetVaultByName(t *testing.T) {
	server, invSvc, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	// Create a test vault
	_, err := invSvc.CreateVault(context.Background(), "Test Vault", "BTC", "Binance Spot", decimal.NewFromFloat(0.5), "long-term")
	require.NoError(t, err)

	// Test getting vault by name
	resp, err := http.Get(server.URL + "/api/vaults/Test Vault")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vault map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vault)
	require.NoError(t, err)

	assert.Equal(t, "Test Vault", vault["vault_name"])
	assert.Equal(t, "BTC", vault["asset"])
}

func TestVaultAPI_GetVaultByName_NotFound(t *testing.T) {
	server, _, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	// Test getting non-existent vault
	resp, err := http.Get(server.URL + "/api/vaults/NonExistent")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestVaultAPI_DepositToVault(t *testing.T) {
	server, invSvc, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	
	// Create a test vault
	_, err := invSvc.CreateVault(context.Background(), "Test Vault", "USDT", "Binance Spot", decimal.NewFromInt(1000), "long-term")
	require.NoError(t, err)

	// Test deposit request
	requestBody := `{
		"quantity": 500,
		"cost": 500,
		"sourceAccount": "Coinbase"
	}`

	resp, err := http.Post(server.URL+"/api/vaults/Test Vault/deposit", "application/json", bytes.NewBufferString(requestBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vault map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vault)
	require.NoError(t, err)

	// Verify deposit was processed (should be 1500 total)
	depositQty, ok := vault["deposit_qty"].(string)
	require.True(t, ok)
	assert.Equal(t, "1500", depositQty)
}

func TestVaultAPI_WithdrawFromVault(t *testing.T) {
	server, invSvc, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	
	// Create a test vault with initial balance
	_, err := invSvc.CreateVault(context.Background(), "Test Vault", "USDT", "Binance Spot", decimal.NewFromInt(1000), "long-term")
	require.NoError(t, err)

	// Test withdrawal request
	requestBody := `{
		"quantity": 300,
		"value": 300,
		"targetAccount": "Personal Wallet"
	}`

	resp, err := http.Post(server.URL+"/api/vaults/Test Vault/withdraw", "application/json", bytes.NewBufferString(requestBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vault map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vault)
	require.NoError(t, err)

	// Verify withdrawal was processed
	withdrawalQty, ok := vault["withdrawal_qty"].(string)
	require.True(t, ok)
	assert.Equal(t, "300", withdrawalQty)
}

func TestVaultAPI_EndVault(t *testing.T) {
	server, invSvc, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	
	// Create a test vault
	_, err := invSvc.CreateVault(context.Background(), "Test Vault", "BTC", "Binance Spot", decimal.NewFromFloat(0.5), "long-term")
	require.NoError(t, err)

	// Test ending vault
	resp, err := http.Post(server.URL+"/api/vaults/Test Vault/end", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var vault map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&vault)
	require.NoError(t, err)

	// Verify vault was ended
	assert.Equal(t, false, vault["is_open"])
	assert.Equal(t, "ended", vault["vault_status"])
}

func TestVaultAPI_ErrorHandling(t *testing.T) {
	server, _, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	tests := []struct {
		name           string
		method         string
		url            string
		body           string
		expectedStatus int
	}{
		{
			name:           "Deposit to non-existent vault",
			method:         "POST",
			url:            "/api/vaults/Non-existent/deposit",
			body:           `{"quantity": 100, "cost": 100, "sourceAccount": "Test"}`,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "Invalid deposit amount",
			method:         "POST",
			url:            "/api/vaults/Test/deposit",
			body:           `{"quantity": -100, "cost": 100, "sourceAccount": "Test"}`,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "Missing source account",
			method:         "POST",
			url:            "/api/vaults/Test/deposit",
			body:           `{"quantity": 100, "cost": 100}`,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "Create vault with missing fields",
			method:         "POST",
			url:            "/api/vaults",
			body:           `{"asset": "BTC"}`,
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var resp *http.Response
			var err error

			req, err := http.NewRequest(tt.method, server.URL+tt.url, bytes.NewBufferString(tt.body))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err = http.DefaultClient.Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
		})
	}
}

func TestVaultAPI_IntegrationWorkflow(t *testing.T) {
	server, _, cleanup := setupVaultAPITestServer(t)
	defer cleanup()

	// Step 1: Create a vault
	createBody := `{
		"name": "Integration Test Vault",
		"asset": "USDT",
		"account": "Binance Spot",
		"initialDeposit": 1000
	}`

	resp, err := http.Post(server.URL+"/api/vaults", "application/json", bytes.NewBufferString(createBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	// Step 2: Deposit to vault
	depositBody := `{
		"quantity": 500,
		"cost": 500,
		"sourceAccount": "Coinbase"
	}`

	resp, err = http.Post(server.URL+"/api/vaults/Integration Test Vault/deposit", "application/json", bytes.NewBufferString(depositBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Step 3: Withdraw from vault
	withdrawBody := `{
		"quantity": 200,
		"value": 200,
		"targetAccount": "Personal Wallet"
	}`

	resp, err = http.Post(server.URL+"/api/vaults/Integration Test Vault/withdraw", "application/json", bytes.NewBufferString(withdrawBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Step 4: Check vault appears in active list
	resp, err = http.Get(server.URL + "/api/vaults")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var activeVaults []map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&activeVaults)
	require.NoError(t, err)

	assert.Len(t, activeVaults, 1)

	// Step 5: End vault
	resp, err = http.Post(server.URL+"/api/vaults/Integration Test Vault/end", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Step 6: Verify vault is no longer active
	resp, err = http.Get(server.URL + "/api/vaults")
	require.NoError(t, err)
	defer resp.Body.Close()

	var finalActiveVaults []map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&finalActiveVaults)
	require.NoError(t, err)

	assert.Empty(t, finalActiveVaults)

	// Step 7: Delete vault
	req, err := http.NewRequest(http.MethodDelete, server.URL+"/api/vaults/Integration Test Vault", nil)
	require.NoError(t, err)

	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Step 8: Verify vault is completely deleted
	resp, err = http.Get(server.URL + "/api/vaults/Integration Test Vault")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}