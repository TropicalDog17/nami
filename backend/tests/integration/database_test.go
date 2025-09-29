package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func setupTestDB(t *testing.T) *db.DB {
	// Reuse shared suite container started in TestMain
	tc := GetSuiteContainer(t)
	return &db.DB{DB: tc.DB}
}

func TestDatabaseConnection(t *testing.T) {
	database := setupTestDB(t)

	err := database.Health()
	if err != nil {
		t.Fatalf("Database health check failed: %v", err)
	}
}

func TestAdminServiceIntegration(t *testing.T) {
	database := setupTestDB(t)

	adminService := services.NewAdminService(database)
	ctx := context.Background()

	// Test listing transaction types
	types, err := adminService.ListTransactionTypes(ctx)
	if err != nil {
		t.Fatalf("Failed to list transaction types: %v", err)
	}

	if len(types) == 0 {
		t.Fatal("Expected transaction types to be seeded")
	}

	// Verify specific transaction types exist
	typeNames := make(map[string]bool)
	for _, tt := range types {
		typeNames[tt.Name] = true
	}

	expectedTypes := []string{"buy", "sell", "expense", "income", "deposit", "withdraw"}
	for _, expectedType := range expectedTypes {
		if !typeNames[expectedType] {
			t.Errorf("Expected transaction type '%s' not found", expectedType)
		}
	}

	// Test creating a new transaction type
	newType := &models.TransactionType{
		Name:        "test_type",
		Description: stringPtr("Test transaction type"),
		IsActive:    true,
	}

	err = adminService.CreateTransactionType(ctx, newType, "test_user")
	if err != nil {
		t.Fatalf("Failed to create transaction type: %v", err)
	}

	if newType.ID == 0 {
		t.Fatal("Expected new transaction type to have an ID")
	}

	// Test updating the transaction type
	newType.Description = stringPtr("Updated test transaction type")
	err = adminService.UpdateTransactionType(ctx, newType, "test_user")
	if err != nil {
		t.Fatalf("Failed to update transaction type: %v", err)
	}

	// Test getting audit trail
	audit, err := adminService.GetTypeAuditTrail(ctx, newType.ID)
	if err != nil {
		t.Fatalf("Failed to get audit trail: %v", err)
	}

	if len(audit) != 2 { // CREATE and UPDATE
		t.Errorf("Expected 2 audit records, got %d", len(audit))
	}

	// Test soft delete
	err = adminService.DeleteTransactionType(ctx, newType.ID, "test_user")
	if err != nil {
		t.Fatalf("Failed to delete transaction type: %v", err)
	}

	// Verify audit trail now has 3 records
	audit, err = adminService.GetTypeAuditTrail(ctx, newType.ID)
	if err != nil {
		t.Fatalf("Failed to get audit trail after delete: %v", err)
	}

	if len(audit) != 3 { // CREATE, UPDATE, DELETE
		t.Errorf("Expected 3 audit records after delete, got %d", len(audit))
	}
}

func TestTransactionServiceIntegration(t *testing.T) {
	database := setupTestDB(t)

	transactionService := services.NewTransactionService(database)
	ctx := context.Background()

	// Test creating a transaction
	tx := &models.Transaction{
		Date:         time.Now().Truncate(24 * time.Hour),
		Type:         "buy",
		Asset:        "BTC",
		Account:      "Exchange",
		Counterparty: stringPtr("Binance"),
		Tag:          stringPtr("Trading"),
		Note:         stringPtr("Test bitcoin purchase"),
		Quantity:     decimal.NewFromFloat(0.5),
		PriceLocal:   decimal.NewFromFloat(50000),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromFloat(24000),
		FeeUSD:       decimal.NewFromFloat(10),
		FeeVND:       decimal.NewFromFloat(240000),
	}

	err := transactionService.CreateTransaction(ctx, tx)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}

	if tx.ID == "" {
		t.Fatal("Expected transaction to have an ID")
	}

	// Verify derived fields were calculated
	expectedAmount := decimal.NewFromFloat(25000) // 0.5 * 50000
	if !tx.AmountLocal.Equal(expectedAmount) {
		t.Errorf("Expected AmountLocal to be %v, got %v", expectedAmount, tx.AmountLocal)
	}

	expectedDeltaQty := decimal.NewFromFloat(0.5) // positive for buy
	if !tx.DeltaQty.Equal(expectedDeltaQty) {
		t.Errorf("Expected DeltaQty to be %v, got %v", expectedDeltaQty, tx.DeltaQty)
	}

	expectedCashFlow := decimal.NewFromFloat(-25010) // -(amount + fee)
	if !tx.CashFlowUSD.Equal(expectedCashFlow) {
		t.Errorf("Expected CashFlowUSD to be %v, got %v", expectedCashFlow, tx.CashFlowUSD)
	}

	// Test getting the transaction
	retrievedTx, err := transactionService.GetTransaction(ctx, tx.ID)
	if err != nil {
		t.Fatalf("Failed to get transaction: %v", err)
	}

	if retrievedTx.Type != "buy" {
		t.Errorf("Expected transaction type to be 'buy', got %s", retrievedTx.Type)
	}

	// Test listing transactions
	transactions, err := transactionService.ListTransactions(ctx, nil)
	if err != nil {
		t.Fatalf("Failed to list transactions: %v", err)
	}

	if len(transactions) == 0 {
		t.Fatal("Expected at least one transaction")
	}

	// Test updating the transaction
	tx.Note = stringPtr("Updated test bitcoin purchase")
	err = transactionService.UpdateTransaction(ctx, tx)
	if err != nil {
		t.Fatalf("Failed to update transaction: %v", err)
	}

	// Test filtering transactions
	filter := &models.TransactionFilter{
		Types: []string{"buy"},
		Limit: 10,
	}

	filteredTx, err := transactionService.ListTransactions(ctx, filter)
	if err != nil {
		t.Fatalf("Failed to list filtered transactions: %v", err)
	}

	if len(filteredTx) == 0 {
		t.Fatal("Expected at least one buy transaction")
	}

	// Test transaction count
	count, err := transactionService.GetTransactionCount(ctx, filter)
	if err != nil {
		t.Fatalf("Failed to get transaction count: %v", err)
	}

	if count == 0 {
		t.Fatal("Expected transaction count to be greater than 0")
	}

	// Test deleting the transaction
	err = transactionService.DeleteTransaction(ctx, tx.ID)
	if err != nil {
		t.Fatalf("Failed to delete transaction: %v", err)
	}

	// Verify transaction is deleted
	_, err = transactionService.GetTransaction(ctx, tx.ID)
	if err == nil {
		t.Fatal("Expected error when getting deleted transaction")
	}
}

func TestCreditCardTransactionFlow(t *testing.T) {
	database := setupTestDB(t)

	transactionService := services.NewTransactionService(database)
	ctx := context.Background()

	// Test credit card expense (should have zero cash flow)
	expense := &models.Transaction{
		Date:         time.Now().Truncate(24 * time.Hour),
		Type:         "expense",
		Asset:        "USD",
		Account:      "CreditCard",
		Counterparty: stringPtr("Restaurant"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Dinner expense"),
		Quantity:     decimal.NewFromFloat(1),
		PriceLocal:   decimal.NewFromFloat(50),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromFloat(24000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
	}

	err := transactionService.CreateTransaction(ctx, expense)
	if err != nil {
		t.Fatalf("Failed to create credit card expense: %v", err)
	}

	// Verify credit card expense has zero cash flow
	if !expense.CashFlowUSD.IsZero() {
		t.Errorf("Expected credit card expense to have zero cash flow, got %v", expense.CashFlowUSD)
	}

	// Verify negative delta quantity (increases liability)
	expectedDelta := decimal.NewFromFloat(-1)
	if !expense.DeltaQty.Equal(expectedDelta) {
		t.Errorf("Expected DeltaQty to be %v, got %v", expectedDelta, expense.DeltaQty)
	}

	// Test repay_borrow transaction (should have negative cash flow)
	repayment := &models.Transaction{
		Date:         time.Now().Truncate(24 * time.Hour).Add(24 * time.Hour),
		Type:         "repay_borrow",
		Asset:        "USD",
		Account:      "Bank",
		Counterparty: stringPtr("Credit Card Payment"),
		Tag:          stringPtr("Payment"),
		Note:         stringPtr("Credit card payment"),
		Quantity:     decimal.NewFromFloat(1),
		PriceLocal:   decimal.NewFromFloat(50),
		FXToUSD:      decimal.NewFromFloat(1.0),
		FXToVND:      decimal.NewFromFloat(24000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
	}

	err = transactionService.CreateTransaction(ctx, repayment)
	if err != nil {
		t.Fatalf("Failed to create repayment transaction: %v", err)
	}

	// Verify repayment has negative cash flow
	expectedCashFlow := decimal.NewFromFloat(-50)
	if !repayment.CashFlowUSD.Equal(expectedCashFlow) {
		t.Errorf("Expected repayment cash flow to be %v, got %v", expectedCashFlow, repayment.CashFlowUSD)
	}

	// Clean up
	transactionService.DeleteTransaction(ctx, expense.ID)
	transactionService.DeleteTransaction(ctx, repayment.ID)
}

func stringPtr(s string) *string {
	return &s
}
