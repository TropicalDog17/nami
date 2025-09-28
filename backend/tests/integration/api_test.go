package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestTransactionAPI(t *testing.T) {
	// Setup test database with testcontainers
	tc := SetupTestContainer(t)
	defer tc.Cleanup(t)

	database := &db.DB{DB: tc.DB}

	// Initialize services and handlers
	transactionService := services.NewTransactionService(database)
	transactionHandler := handlers.NewTransactionHandler(transactionService)

	// Test data
	testTransaction := models.Transaction{
		Date:         time.Now().UTC(),
		Type:         "buy",
		Asset:        "BTC",
		Account:      "Binance Spot",
		Counterparty: stringPtr("Test Exchange"),
		Tag:          stringPtr("Trading"),
		Note:         stringPtr("Test transaction"),
		Quantity:     mustDecimal("0.001"),
		PriceLocal:   mustDecimal("67000"),
		FXToUSD:      mustDecimal("1.0"),
		FXToVND:      mustDecimal("24000.0"),
		FeeUSD:       mustDecimal("1.5"),
		FeeVND:       mustDecimal("36000.0"),
	}

	t.Run("Create Transaction", func(t *testing.T) {
		body, _ := json.Marshal(testTransaction)
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
		}

		var result models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if result.ID == "" {
			t.Error("Expected transaction ID to be set")
		}

		if result.Type != "buy" {
			t.Errorf("Expected type 'buy', got '%s'", result.Type)
		}

		// Verify derived fields are calculated
		if result.AmountLocal.IsZero() {
			t.Error("Expected amount_local to be calculated")
		}

		if result.DeltaQty.IsZero() {
			t.Error("Expected delta_qty to be calculated")
		}

		if result.CashFlowUSD.IsZero() {
			t.Error("Expected cashflow_usd to be calculated")
		}
	})

	t.Run("List Transactions", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/transactions", nil)
		w := httptest.NewRecorder()

		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		var transactions []*models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &transactions); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if len(transactions) == 0 {
			t.Error("Expected at least one transaction")
		}
	})

	t.Run("Credit Card Flow", func(t *testing.T) {
		// Step 1: Credit card expense
		expense := models.Transaction{
			Date:         time.Now().UTC(),
			Type:         "expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Counterparty: stringPtr("Test Store"),
			Tag:          stringPtr("Food"),
			Note:         stringPtr("Test expense"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("10.0"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		body, _ := json.Marshal(expense)
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
		}

		var expenseResult models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &expenseResult); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Verify credit card expense has zero cash flow
		if !expenseResult.CashFlowUSD.IsZero() {
			t.Errorf("Expected credit card expense to have zero cash flow, got %s", expenseResult.CashFlowUSD.String())
		}

		// Step 2: Repayment
		repayment := models.Transaction{
			Date:         time.Now().UTC().Add(24 * time.Hour),
			Type:         "repay_borrow",
			Asset:        "USD",
			Account:      "Bank",
			Counterparty: stringPtr("Credit Card Payment"),
			Tag:          stringPtr("Payment"),
			Note:         stringPtr("Credit card repayment"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("10.0"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		body, _ = json.Marshal(repayment)
		req = httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w = httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
		}

		var repaymentResult models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &repaymentResult); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Verify repayment has negative cash flow
		if !repaymentResult.CashFlowUSD.Equal(mustDecimal("-10.0")) {
			t.Errorf("Expected repayment cash flow to be -10.0, got %s", repaymentResult.CashFlowUSD.String())
		}
	})
}

func TestAdminAPI(t *testing.T) {
	// Setup test database with testcontainers
	tc := SetupTestContainer(t)
	defer tc.Cleanup(t)

	database := &db.DB{DB: tc.DB}

	// Initialize services and handlers
	adminService := services.NewAdminService(database)
	adminHandler := handlers.NewAdminHandler(adminService)

	t.Run("List Transaction Types", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/admin/types", nil)
		w := httptest.NewRecorder()

		adminHandler.HandleTransactionTypes(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		var types []*models.TransactionType
		if err := json.Unmarshal(w.Body.Bytes(), &types); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if len(types) == 0 {
			t.Error("Expected at least one transaction type")
		}

		// Verify we have the essential types
		typeNames := make(map[string]bool)
		for _, tt := range types {
			typeNames[tt.Name] = true
		}

		essentialTypes := []string{"buy", "sell", "expense", "income", "deposit", "withdraw"}
		for _, essentialType := range essentialTypes {
			if !typeNames[essentialType] {
				t.Errorf("Missing essential transaction type: %s", essentialType)
			}
		}
	})

	t.Run("List Accounts", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/admin/accounts", nil)
		w := httptest.NewRecorder()

		adminHandler.HandleAccounts(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		var accounts []*models.Account
		if err := json.Unmarshal(w.Body.Bytes(), &accounts); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if len(accounts) == 0 {
			t.Error("Expected at least one account")
		}
	})

	t.Run("List Assets", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/admin/assets", nil)
		w := httptest.NewRecorder()

		adminHandler.HandleAssets(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		var assets []*models.Asset
		if err := json.Unmarshal(w.Body.Bytes(), &assets); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if len(assets) == 0 {
			t.Error("Expected at least one asset")
		}
	})

	t.Run("CRUD Transaction Types", func(t *testing.T) {
		// Create a test transaction type
		testType := models.TransactionType{
			Name:        "test_type",
			Description: stringPtr("Test transaction type"),
			IsActive:    true,
		}

		t.Run("Create Transaction Type", func(t *testing.T) {
			body, _ := json.Marshal(testType)
			req := httptest.NewRequest("POST", "/api/admin/types", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionTypes(w, req)

			if w.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d", http.StatusCreated, w.Code)
			}

			var created models.TransactionType
			if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if created.ID == 0 {
				t.Error("Expected ID to be set")
			}
			if created.Name != testType.Name {
				t.Errorf("Expected name %s, got %s", testType.Name, created.Name)
			}
			testType.ID = created.ID
		})

		t.Run("Get Transaction Type", func(t *testing.T) {
			req := httptest.NewRequest("GET", fmt.Sprintf("/api/admin/types/%d", testType.ID), nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
			}

			var retrieved models.TransactionType
			if err := json.Unmarshal(w.Body.Bytes(), &retrieved); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if retrieved.ID != testType.ID {
				t.Errorf("Expected ID %d, got %d", testType.ID, retrieved.ID)
			}
		})

		t.Run("Update Transaction Type", func(t *testing.T) {
			updatedType := testType
			updatedType.Description = stringPtr("Updated description")

			body, _ := json.Marshal(updatedType)
			req := httptest.NewRequest("PUT", fmt.Sprintf("/api/admin/types/%d", testType.ID), bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
			}

			var updated models.TransactionType
			if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if updated.Description == nil || *updated.Description != "Updated description" {
				t.Error("Expected description to be updated")
			}
		})

		t.Run("Delete Transaction Type", func(t *testing.T) {
			req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/admin/types/%d", testType.ID), nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusNoContent {
				t.Errorf("Expected status %d, got %d", http.StatusNoContent, w.Code)
			}
		})

		t.Run("Verify Transaction Type is Soft Deleted", func(t *testing.T) {
			req := httptest.NewRequest("GET", fmt.Sprintf("/api/admin/types/%d", testType.ID), nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
			}

			var retrieved models.TransactionType
			if err := json.Unmarshal(w.Body.Bytes(), &retrieved); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			if retrieved.IsActive {
				t.Error("Expected transaction type to be inactive after deletion")
			}
		})

		t.Run("Delete Non-existent Transaction Type", func(t *testing.T) {
			req := httptest.NewRequest("DELETE", "/api/admin/types/99999", nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusInternalServerError {
				t.Errorf("Expected status %d for non-existent type, got %d", http.StatusInternalServerError, w.Code)
			}
		})

		t.Run("Delete Already Inactive Transaction Type", func(t *testing.T) {
			req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/admin/types/%d", testType.ID), nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionType(w, req)

			if w.Code != http.StatusInternalServerError {
				t.Errorf("Expected status %d for already inactive type, got %d", http.StatusInternalServerError, w.Code)
			}
		})

		t.Run("List Only Shows Active Types", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/admin/types", nil)
			w := httptest.NewRecorder()

			adminHandler.HandleTransactionTypes(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
			}

			var types []*models.TransactionType
			if err := json.Unmarshal(w.Body.Bytes(), &types); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			// Should not include the deleted (inactive) test type
			for _, tt := range types {
				if tt.ID == testType.ID {
					t.Errorf("Inactive transaction type %d should not be in the list", testType.ID)
				}
				if !tt.IsActive {
					t.Errorf("Inactive transaction type %d found in list", tt.ID)
				}
			}
		})
	})
}

// Helper functions
func mustDecimal(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return d
}
