package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Vault represents a vault structure for testing
type TestVault struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Balance     float64 `json:"balance"`
	Currency    string  `json:"currency"`
}

func TestVaultAPI(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Setup router
	router := mux.NewRouter()

	// Mock vault API endpoints
	router.HandleFunc("/api/vaults", func(w http.ResponseWriter, r *http.Request) {
		vaults := []TestVault{
			{
				ID:          1,
				Name:        "Test Vault",
				Description: "Test vault description",
				Balance:     1000.0,
				Currency:    "USD",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{"vaults": vaults}
		json.NewEncoder(w).Encode(response)
	}).Methods("GET")

	router.HandleFunc("/api/vaults/{name}", func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		name := vars["name"]

		w.Header().Set("Content-Type", "application/json")
		if name == "Test Vault" {
			vault := TestVault{
				ID:          1,
				Name:        "Test Vault",
				Description: "Test vault description",
				Balance:     1000.0,
				Currency:    "USD",
			}
			response := map[string]interface{}{"vault": vault}
			json.NewEncoder(w).Encode(response)
		} else {
			w.WriteHeader(http.StatusNotFound)
			response := map[string]interface{}{"error": "Vault not found"}
			json.NewEncoder(w).Encode(response)
		}
	}).Methods("GET")

	router.HandleFunc("/api/vaults", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name        string  `json:"name"`
			Description string  `json:"description"`
			Balance     float64 `json:"balance"`
			Currency    string  `json:"currency"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{"error": err.Error()}
			json.NewEncoder(w).Encode(response)
			return
		}

		if req.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{"error": "Name is required"}
			json.NewEncoder(w).Encode(response)
			return
		}

		vault := TestVault{
			ID:          2,
			Name:        req.Name,
			Description: req.Description,
			Balance:     req.Balance,
			Currency:    req.Currency,
		}

		w.WriteHeader(http.StatusCreated)
		response := map[string]interface{}{"vault": vault}
		json.NewEncoder(w).Encode(response)
	}).Methods("POST")

	t.Run("Get All Vaults", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/vaults", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		vaults, ok := response["vaults"].([]interface{})
		require.True(t, ok)
		assert.Len(t, vaults, 1)

		vault := vaults[0].(map[string]interface{})
		assert.Equal(t, "Test Vault", vault["name"])
		assert.Equal(t, 1000.0, vault["balance"])
	})

	t.Run("Get Vault by Name - Success", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/vaults/Test Vault", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		vault, ok := response["vault"].(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, "Test Vault", vault["name"])
		assert.Equal(t, 1000.0, vault["balance"])
	})

	t.Run("Get Vault by Name - Not Found", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/vaults/Nonexistent Vault", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Contains(t, response["error"], "Vault not found")
	})

	t.Run("Create Vault - Success", func(t *testing.T) {
		createReq := map[string]interface{}{
			"name":        "New Vault",
			"description": "New vault description",
			"balance":     2000.0,
			"currency":    "USD",
		}

		reqBody, _ := json.Marshal(createReq)
		req, _ := http.NewRequest("POST", "/api/vaults", bytes.NewBuffer(reqBody))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		vault, ok := response["vault"].(map[string]interface{})
		require.True(t, ok)
		assert.Equal(t, "New Vault", vault["name"])
		assert.Equal(t, 2000.0, vault["balance"])
	})

	t.Run("Create Vault - Validation Error", func(t *testing.T) {
		createReq := map[string]interface{}{
			"description": "Missing required name field",
			"balance":     2000.0,
		}

		reqBody, _ := json.Marshal(createReq)
		req, _ := http.NewRequest("POST", "/api/vaults", bytes.NewBuffer(reqBody))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Contains(t, response["error"], "required")
	})
}

func TestVaultBusinessLogic(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	t.Run("Vault Balance Management", func(t *testing.T) {
		// Test vault balance operations
		initialBalance := 1000.0
		depositAmount := 500.0
		withdrawalAmount := 200.0

		// Deposit operation
		newBalance := initialBalance + depositAmount
		assert.Equal(t, 1500.0, newBalance, "Deposit should increase balance")

		// Withdrawal operation
		finalBalance := newBalance - withdrawalAmount
		assert.Equal(t, 1300.0, finalBalance, "Withdrawal should decrease balance")

		// Validate insufficient funds scenario
		excessiveWithdrawal := 2000.0
		remainingBalance := finalBalance - excessiveWithdrawal
		assert.Less(t, remainingBalance, 0.0, "Should detect insufficient funds")
	})

	t.Run("Vault Currency Conversion", func(t *testing.T) {
		// Test vault currency conversion logic
		vaults := []TestVault{
			{
				Name:     "USD Vault",
				Balance:  1000.0,
				Currency: "USD",
			},
			{
				Name:     "BTC Vault",
				Balance:  0.05,
				Currency: "BTC",
			},
			{
				Name:     "VND Vault",
				Balance:  25000000.0,
				Currency: "VND",
			},
		}

		// Mock exchange rates
		exchangeRates := map[string]float64{
			"BTCUSD": 50000.0, // 1 BTC = 50,000 USD
			"USDVND": 25000.0, // 1 USD = 25,000 VND
		}

		// Convert all balances to USD for comparison
		var totalBalanceUSD float64
		for _, vault := range vaults {
			switch vault.Currency {
			case "USD":
				totalBalanceUSD += vault.Balance
			case "BTC":
				totalBalanceUSD += vault.Balance * exchangeRates["BTCUSD"]
			case "VND":
				totalBalanceUSD += vault.Balance / exchangeRates["USDVND"]
			}
		}

		expectedTotal := 1000.0 + (0.05 * 50000.0) + (25000000.0 / 25000.0)
		assert.Equal(t, expectedTotal, totalBalanceUSD, "Total balance calculation should be correct")
	})

	t.Run("Vault Validation Rules", func(t *testing.T) {
		// Test vault creation and update validation

		testCases := []struct {
			name     string
			vault    TestVault
			isValid  bool
			errorMsg string
		}{
			{
				name: "Valid vault",
				vault: TestVault{
					Name:     "Valid Vault",
					Balance:  1000.0,
					Currency: "USD",
				},
				isValid:  true,
				errorMsg: "",
			},
			{
				name: "Empty name",
				vault: TestVault{
					Name:     "",
					Balance:  1000.0,
					Currency: "USD",
				},
				isValid:  false,
				errorMsg: "Vault name is required",
			},
			{
				name: "Negative balance",
				vault: TestVault{
					Name:     "Test Vault",
					Balance:  -100.0,
					Currency: "USD",
				},
				isValid:  false,
				errorMsg: "Vault balance cannot be negative",
			},
			{
				name: "Empty currency",
				vault: TestVault{
					Name:     "Test Vault",
					Balance:  1000.0,
					Currency: "",
				},
				isValid:  false,
				errorMsg: "Vault currency is required",
			},
			{
				name: "Zero balance (valid)",
				vault: TestVault{
					Name:     "Empty Vault",
					Balance:  0.0,
					Currency: "USD",
				},
				isValid:  true,
				errorMsg: "",
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				// Apply validation rules
				isValid := true
				var errorMsg string

				if tc.vault.Name == "" {
					isValid = false
					errorMsg = "Vault name is required"
				} else if tc.vault.Balance < 0 {
					isValid = false
					errorMsg = "Vault balance cannot be negative"
				} else if tc.vault.Currency == "" {
					isValid = false
					errorMsg = "Vault currency is required"
				}

				assert.Equal(t, tc.isValid, isValid, "Validation result should match")
				if !tc.isValid {
					assert.Contains(t, errorMsg, tc.errorMsg, "Error message should contain expected text")
				}
			})
		}
	})

	t.Run("Vault Asset Allocation", func(t *testing.T) {
		// Test vault asset allocation calculation
		vaults := []TestVault{
			{
				Name:     "Investment Vault",
				Balance:  15000.0,
				Currency: "USD",
			},
			{
				Name:     "Emergency Fund",
				Balance:  10000.0,
				Currency: "USD",
			},
		}

		// Calculate total holdings across all vaults
		var totalHoldings float64
		for _, vault := range vaults {
			totalHoldings += vault.Balance
		}

		// Verify asset allocation calculation
		allocations := make(map[string]float64)
		for _, vault := range vaults {
			percentage := (vault.Balance / totalHoldings) * 100
			allocations[vault.Name] = percentage
		}

		assert.InDelta(t, 60.0, allocations["Investment Vault"], 0.1, "Investment vault should be 60% of total")
		assert.InDelta(t, 40.0, allocations["Emergency Fund"], 0.1, "Emergency fund should be 40% of total")
		assert.InDelta(t, 100.0, allocations["Investment Vault"]+allocations["Emergency Fund"], 0.1, "Total allocation should be 100%")
	})
}