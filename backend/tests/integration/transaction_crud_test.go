package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestTransactionCRUD(t *testing.T) {
	// Setup test database with testcontainers
	tc := SetupTestContainer(t)
	defer tc.Cleanup(t)

	database := &db.DB{DB: tc.DB}

	// Initialize services and handlers
	transactionService := services.NewTransactionService(database)
	transactionHandler := handlers.NewTransactionHandler(transactionService)

	// Test transaction data
	testTransaction := models.Transaction{
		Date:         time.Now().UTC(),
		Type:         "buy",
		Asset:        "BTC",
		Account:      "Binance Spot",
		Counterparty: stringPtr("Test Exchange CRUD"),
		Tag:          stringPtr("Trading"),
		Note:         stringPtr("CRUD test transaction"),
		Quantity:     mustDecimal("0.5"),
		PriceLocal:   mustDecimal("60000"),
		FXToUSD:      mustDecimal("1.0"),
		FXToVND:      mustDecimal("24000.0"),
		FeeUSD:       mustDecimal("10.0"),
		FeeVND:       mustDecimal("240000.0"),
	}

	var createdTransaction models.Transaction

	t.Run("Create Transaction", func(t *testing.T) {
		body, _ := json.Marshal(testTransaction)
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
		}

		if err := json.Unmarshal(w.Body.Bytes(), &createdTransaction); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Verify basic fields
		if createdTransaction.ID == "" {
			t.Error("Expected transaction ID to be set")
		}
		if createdTransaction.Type != "buy" {
			t.Errorf("Expected type 'buy', got '%s'", createdTransaction.Type)
		}
		if createdTransaction.Asset != "BTC" {
			t.Errorf("Expected asset 'BTC', got '%s'", createdTransaction.Asset)
		}

		// Verify derived fields are calculated correctly
		expectedAmountLocal := mustDecimal("30000") // 0.5 * 60000
		if !createdTransaction.AmountLocal.Equal(expectedAmountLocal) {
			t.Errorf("Expected amount_local %s, got %s", expectedAmountLocal, createdTransaction.AmountLocal)
		}

		expectedAmountUSD := mustDecimal("30000") // 30000 * 1.0
		if !createdTransaction.AmountUSD.Equal(expectedAmountUSD) {
			t.Errorf("Expected amount_usd %s, got %s", expectedAmountUSD, createdTransaction.AmountUSD)
		}

		expectedAmountVND := mustDecimal("720000000") // 30000 * 24000
		if !createdTransaction.AmountVND.Equal(expectedAmountVND) {
			t.Errorf("Expected amount_vnd %s, got %s", expectedAmountVND, createdTransaction.AmountVND)
		}

		// For buy transaction, delta_qty should be positive
		expectedDeltaQty := mustDecimal("0.5")
		if !createdTransaction.DeltaQty.Equal(expectedDeltaQty) {
			t.Errorf("Expected delta_qty %s, got %s", expectedDeltaQty, createdTransaction.DeltaQty)
		}

		// For buy transaction, cash flow should be negative (money out)
		expectedCashFlowUSD := mustDecimal("-30010") // -(30000 + 10)
		if !createdTransaction.CashFlowUSD.Equal(expectedCashFlowUSD) {
			t.Errorf("Expected cashflow_usd %s, got %s", expectedCashFlowUSD, createdTransaction.CashFlowUSD)
		}

		expectedCashFlowVND := mustDecimal("-720240000") // -(720000000 + 240000)
		if !createdTransaction.CashFlowVND.Equal(expectedCashFlowVND) {
			t.Errorf("Expected cashflow_vnd %s, got %s", expectedCashFlowVND, createdTransaction.CashFlowVND)
		}
	})

	t.Run("Read Transaction", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/transactions/"+createdTransaction.ID, nil)
		w := httptest.NewRecorder()

		transactionHandler.HandleTransaction(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		var retrievedTransaction models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &retrievedTransaction); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		if retrievedTransaction.ID != createdTransaction.ID {
			t.Errorf("Expected ID %s, got %s", createdTransaction.ID, retrievedTransaction.ID)
		}

		if *retrievedTransaction.Counterparty != "Test Exchange CRUD" {
			t.Errorf("Expected counterparty 'Test Exchange CRUD', got '%s'", *retrievedTransaction.Counterparty)
		}
	})

	t.Run("Update Transaction", func(t *testing.T) {
		// Update the transaction
		updatedTransaction := createdTransaction
		updatedTransaction.Counterparty = stringPtr("Updated Exchange CRUD")
		updatedTransaction.Note = stringPtr("Updated CRUD test transaction")
		updatedTransaction.Quantity = mustDecimal("1.0")     // Change quantity to test recalculation
		updatedTransaction.PriceLocal = mustDecimal("65000") // Change price

		body, _ := json.Marshal(updatedTransaction)
		req := httptest.NewRequest("PUT", "/api/transactions/"+createdTransaction.ID, bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransaction(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
		}

		var result models.Transaction
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Verify the update
		if *result.Counterparty != "Updated Exchange CRUD" {
			t.Errorf("Expected updated counterparty 'Updated Exchange CRUD', got '%s'", *result.Counterparty)
		}

		// Verify recalculated fields
		expectedAmountLocal := mustDecimal("65000") // 1.0 * 65000
		if !result.AmountLocal.Equal(expectedAmountLocal) {
			t.Errorf("Expected updated amount_local %s, got %s", expectedAmountLocal, result.AmountLocal)
		}

		expectedDeltaQty := mustDecimal("1.0")
		if !result.DeltaQty.Equal(expectedDeltaQty) {
			t.Errorf("Expected updated delta_qty %s, got %s", expectedDeltaQty, result.DeltaQty)
		}

		// Update our reference for the delete test
		createdTransaction = result
	})

	t.Run("List Transactions with Filters", func(t *testing.T) {
		// Test listing all transactions
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

		// Should have at least our created transaction
		found := false
		for _, tx := range transactions {
			if tx.ID == createdTransaction.ID {
				found = true
				break
			}
		}
		if !found {
			t.Error("Created transaction not found in list")
		}

		// Test filtering by type
		req = httptest.NewRequest("GET", "/api/transactions?types=buy", nil)
		w = httptest.NewRecorder()

		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		if err := json.Unmarshal(w.Body.Bytes(), &transactions); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// All returned transactions should be 'buy' type
		for _, tx := range transactions {
			if tx.Type != "buy" {
				t.Errorf("Expected all transactions to be 'buy' type, found '%s'", tx.Type)
			}
		}

		// Test filtering by asset
		req = httptest.NewRequest("GET", "/api/transactions?assets=BTC", nil)
		w = httptest.NewRecorder()

		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
		}

		if err := json.Unmarshal(w.Body.Bytes(), &transactions); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// All returned transactions should be BTC
		for _, tx := range transactions {
			if tx.Asset != "BTC" {
				t.Errorf("Expected all transactions to be 'BTC' asset, found '%s'", tx.Asset)
			}
		}
	})

	t.Run("Delete Transaction", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/transactions/"+createdTransaction.ID, nil)
		w := httptest.NewRecorder()

		transactionHandler.HandleTransaction(w, req)

		if w.Code != http.StatusNoContent {
			t.Errorf("Expected status %d, got %d", http.StatusNoContent, w.Code)
		}

		// Verify the transaction is deleted
		req = httptest.NewRequest("GET", "/api/transactions/"+createdTransaction.ID, nil)
		w = httptest.NewRecorder()

		transactionHandler.HandleTransaction(w, req)

		if w.Code != http.StatusNotFound && w.Code != http.StatusInternalServerError {
			t.Errorf("Expected status %d or %d after deletion, got %d", http.StatusNotFound, http.StatusInternalServerError, w.Code)
		}
	})
}

func TestTransactionTypesAndCalculations(t *testing.T) {
	// Setup test database
	config := &db.Config{
		Host:     "localhost",
		Port:     "5433",
		User:     "nami_user",
		Password: "nami_password",
		Name:     "nami",
		SSLMode:  "disable",
	}

	database, err := db.Connect(config)
	if err != nil {
		t.Skipf("Database connection failed: %v", err)
	}
	defer database.Close()

	transactionService := services.NewTransactionService(database)
	transactionHandler := handlers.NewTransactionHandler(transactionService)

	testCases := []struct {
		name                string
		transactionType     string
		account             string
		expectedDeltaQty    string
		expectedCashFlowUSD string
		expectedCashFlowVND string
	}{
		{
			name:                "Buy Transaction",
			transactionType:     "buy",
			account:             "Binance Spot",
			expectedDeltaQty:    "1",
			expectedCashFlowUSD: "-1010",     // -(1000 + 10)
			expectedCashFlowVND: "-24240000", // -(24000000 + 240000)
		},
		{
			name:                "Sell Transaction",
			transactionType:     "sell",
			account:             "Binance Spot",
			expectedDeltaQty:    "-1",
			expectedCashFlowUSD: "990",      // 1000 - 10
			expectedCashFlowVND: "23760000", // 24000000 - 240000
		},
		{
			name:                "Income Transaction",
			transactionType:     "income",
			account:             "Bank",
			expectedDeltaQty:    "1",
			expectedCashFlowUSD: "990",      // 1000 - 10
			expectedCashFlowVND: "23760000", // 24000000 - 240000
		},
		{
			name:                "Expense Transaction (Regular Account)",
			transactionType:     "expense",
			account:             "Cash",
			expectedDeltaQty:    "-1",
			expectedCashFlowUSD: "-1010",     // -(1000 + 10)
			expectedCashFlowVND: "-24240000", // -(24000000 + 240000)
		},
		{
			name:                "Expense Transaction (Credit Card)",
			transactionType:     "expense",
			account:             "CreditCard",
			expectedDeltaQty:    "-1",
			expectedCashFlowUSD: "0", // Credit card has no immediate cash flow
			expectedCashFlowVND: "0", // Credit card has no immediate cash flow
		},
		{
			name:                "Repay Borrow Transaction",
			transactionType:     "repay_borrow",
			account:             "Bank",
			expectedDeltaQty:    "-1",
			expectedCashFlowUSD: "-1010",     // -(1000 + 10)
			expectedCashFlowVND: "-24240000", // -(24000000 + 240000)
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			testTransaction := models.Transaction{
				Date:         time.Now().UTC(),
				Type:         tc.transactionType,
				Asset:        "USD",
				Account:      tc.account,
				Counterparty: stringPtr("Test " + tc.transactionType),
				Tag:          stringPtr("Test"),
				Note:         stringPtr("Testing " + tc.transactionType),
				Quantity:     mustDecimal("1"),
				PriceLocal:   mustDecimal("1000"),
				FXToUSD:      mustDecimal("1.0"),
				FXToVND:      mustDecimal("24000.0"),
				FeeUSD:       mustDecimal("10.0"),
				FeeVND:       mustDecimal("240000.0"),
			}

			body, _ := json.Marshal(testTransaction)
			req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			transactionHandler.HandleTransactions(w, req)

			if w.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
				return
			}

			var result models.Transaction
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatalf("Failed to unmarshal response: %v", err)
			}

			// Check delta quantity
			expectedDeltaQty := mustDecimal(tc.expectedDeltaQty)
			if !result.DeltaQty.Equal(expectedDeltaQty) {
				t.Errorf("Expected delta_qty %s, got %s", expectedDeltaQty, result.DeltaQty)
			}

			// Check cash flow USD
			expectedCashFlowUSD := mustDecimal(tc.expectedCashFlowUSD)
			if !result.CashFlowUSD.Equal(expectedCashFlowUSD) {
				t.Errorf("Expected cashflow_usd %s, got %s", expectedCashFlowUSD, result.CashFlowUSD)
			}

			// Check cash flow VND
			expectedCashFlowVND := mustDecimal(tc.expectedCashFlowVND)
			if !result.CashFlowVND.Equal(expectedCashFlowVND) {
				t.Errorf("Expected cashflow_vnd %s, got %s", expectedCashFlowVND, result.CashFlowVND)
			}

			// Clean up
			req = httptest.NewRequest("DELETE", "/api/transactions/"+result.ID, nil)
			w = httptest.NewRecorder()
			transactionHandler.HandleTransaction(w, req)
		})
	}
}

func TestCreditCardFlow(t *testing.T) {
	// Setup test database
	config := &db.Config{
		Host:     "localhost",
		Port:     "5433",
		User:     "nami_user",
		Password: "nami_password",
		Name:     "nami",
		SSLMode:  "disable",
	}

	database, err := db.Connect(config)
	if err != nil {
		t.Skipf("Database connection failed: %v", err)
	}
	defer database.Close()

	transactionService := services.NewTransactionService(database)
	transactionHandler := handlers.NewTransactionHandler(transactionService)

	var expenseTransaction, repaymentTransaction models.Transaction

	t.Run("Create Credit Card Expense", func(t *testing.T) {
		expense := models.Transaction{
			Date:         time.Now().UTC(),
			Type:         "expense",
			Asset:        "USD",
			Account:      "CreditCard",
			Counterparty: stringPtr("Test Restaurant"),
			Tag:          stringPtr("Food"),
			Note:         stringPtr("Dinner expense"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("50"),
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
			t.Fatalf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
		}

		if err := json.Unmarshal(w.Body.Bytes(), &expenseTransaction); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Credit card expense should have zero cash flow
		if !expenseTransaction.CashFlowUSD.IsZero() {
			t.Errorf("Expected credit card expense to have zero USD cash flow, got %s", expenseTransaction.CashFlowUSD)
		}
		if !expenseTransaction.CashFlowVND.IsZero() {
			t.Errorf("Expected credit card expense to have zero VND cash flow, got %s", expenseTransaction.CashFlowVND)
		}

		// But should have negative delta quantity (increasing liability)
		expectedDeltaQty := mustDecimal("-1")
		if !expenseTransaction.DeltaQty.Equal(expectedDeltaQty) {
			t.Errorf("Expected delta_qty %s, got %s", expectedDeltaQty, expenseTransaction.DeltaQty)
		}
	})

	t.Run("Create Repayment Transaction", func(t *testing.T) {
		repayment := models.Transaction{
			Date:         time.Now().UTC().Add(24 * time.Hour),
			Type:         "repay_borrow",
			Asset:        "USD",
			Account:      "Bank",
			Counterparty: stringPtr("Credit Card Payment"),
			Tag:          stringPtr("Payment"),
			Note:         stringPtr("Pay credit card bill"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("50"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		body, _ := json.Marshal(repayment)
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
		}

		if err := json.Unmarshal(w.Body.Bytes(), &repaymentTransaction); err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Repayment should have negative cash flow (money out)
		expectedCashFlowUSD := mustDecimal("-50")
		if !repaymentTransaction.CashFlowUSD.Equal(expectedCashFlowUSD) {
			t.Errorf("Expected repayment cashflow_usd %s, got %s", expectedCashFlowUSD, repaymentTransaction.CashFlowUSD)
		}

		expectedCashFlowVND := mustDecimal("-1200000") // -50 * 24000
		if !repaymentTransaction.CashFlowVND.Equal(expectedCashFlowVND) {
			t.Errorf("Expected repayment cashflow_vnd %s, got %s", expectedCashFlowVND, repaymentTransaction.CashFlowVND)
		}
	})

	t.Run("Verify Total Cash Flow Impact", func(t *testing.T) {
		// The total cash flow impact should be:
		// Expense: $0 (no immediate impact)
		// Repayment: -$50 (actual money out)
		// Total: -$50

		totalCashFlowUSD := expenseTransaction.CashFlowUSD.Add(repaymentTransaction.CashFlowUSD)
		expectedTotalUSD := mustDecimal("-50")

		if !totalCashFlowUSD.Equal(expectedTotalUSD) {
			t.Errorf("Expected total cash flow impact %s USD, got %s", expectedTotalUSD, totalCashFlowUSD)
		}

		totalCashFlowVND := expenseTransaction.CashFlowVND.Add(repaymentTransaction.CashFlowVND)
		expectedTotalVND := mustDecimal("-1200000")

		if !totalCashFlowVND.Equal(expectedTotalVND) {
			t.Errorf("Expected total cash flow impact %s VND, got %s", expectedTotalVND, totalCashFlowVND)
		}
	})

	// Clean up
	t.Cleanup(func() {
		if expenseTransaction.ID != "" {
			req := httptest.NewRequest("DELETE", "/api/transactions/"+expenseTransaction.ID, nil)
			w := httptest.NewRecorder()
			transactionHandler.HandleTransaction(w, req)
		}
		if repaymentTransaction.ID != "" {
			req := httptest.NewRequest("DELETE", "/api/transactions/"+repaymentTransaction.ID, nil)
			w := httptest.NewRecorder()
			transactionHandler.HandleTransaction(w, req)
		}
	})
}

func TestValidationAndErrorHandling(t *testing.T) {
	// Setup test database
	config := &db.Config{
		Host:     "localhost",
		Port:     "5433",
		User:     "nami_user",
		Password: "nami_password",
		Name:     "nami",
		SSLMode:  "disable",
	}

	database, err := db.Connect(config)
	if err != nil {
		t.Skipf("Database connection failed: %v", err)
	}
	defer database.Close()

	transactionService := services.NewTransactionService(database)
	transactionHandler := handlers.NewTransactionHandler(transactionService)

	t.Run("Missing Required Fields", func(t *testing.T) {
		invalidTransaction := models.Transaction{
			// Missing required fields like Date, Type, Asset, etc.
			Note: stringPtr("Invalid transaction"),
		}

		body, _ := json.Marshal(invalidTransaction)
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code == http.StatusCreated {
			t.Error("Expected validation error, but transaction was created")
		}
	})

	t.Run("Invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBufferString("{invalid json"))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		transactionHandler.HandleTransactions(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected status %d for invalid JSON, got %d", http.StatusBadRequest, w.Code)
		}
	})

	t.Run("Non-existent Transaction ID", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/transactions/non-existent-id", nil)
		w := httptest.NewRecorder()

		transactionHandler.HandleTransaction(w, req)

		if w.Code != http.StatusNotFound && w.Code != http.StatusInternalServerError {
			t.Errorf("Expected status %d or %d for non-existent ID, got %d",
				http.StatusNotFound, http.StatusInternalServerError, w.Code)
		}
	})
}
