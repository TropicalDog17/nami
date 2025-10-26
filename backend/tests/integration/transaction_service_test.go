package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

func TestTransactionService_UpdateTransaction(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	// Create a test transaction
	testTx := &models.Transaction{
		Date:         time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Test Shop"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Test transaction"),
		Quantity:     decimal.NewFromFloat(10),
		PriceLocal:   decimal.NewFromFloat(1),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000),
		AmountUSD:    decimal.NewFromFloat(10),
		AmountVND:    decimal.NewFromFloat(240000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
		DeltaQty:     decimal.NewFromFloat(-10),
		CashFlowUSD:  decimal.NewFromFloat(-10),
		CashFlowVND:  decimal.NewFromFloat(-240000),
		FXSource:     stringPtr("auto-fx-provider"),
		FXTimestamp:  &time.Time{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Insert test transaction
	err := service.CreateTransaction(ctx, testTx)
	if err != nil {
		t.Fatalf("Failed to create test transaction: %v", err)
	}

	// Test partial update - only update type
	updateData := &models.Transaction{
		ID:   testTx.ID,
		Type: "income",
	}

	err = service.UpdateTransaction(ctx, updateData)
	if err != nil {
		t.Fatalf("Failed to update transaction: %v", err)
	}

	// Verify the update
	updated, err := service.GetTransaction(ctx, testTx.ID)
	if err != nil {
		t.Fatalf("Failed to get updated transaction: %v", err)
	}

	// Check that type was updated
	if updated.Type != "income" {
		t.Errorf("Expected type to be 'income', got '%s'", updated.Type)
	}

	// Check that other fields were preserved
	if updated.Asset != "USD" {
		t.Errorf("Expected asset to be preserved as 'USD', got '%s'", updated.Asset)
	}

	if updated.Quantity.String() != "10" {
		t.Errorf("Expected quantity to be preserved as '10', got '%s'", updated.Quantity.String())
	}

	// Check that derived fields were recalculated (income should have positive cashflow)
	if !updated.CashFlowUSD.IsPositive() {
		t.Errorf("Expected cashflow to be positive for income, got %s", updated.CashFlowUSD.String())
	}
}

func TestTransactionService_UpdateTransactionMultipleFields(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	// Create a test transaction
	testTx := &models.Transaction{
		Date:         time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Old Shop"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Old transaction"),
		Quantity:     decimal.NewFromFloat(5),
		PriceLocal:   decimal.NewFromFloat(2),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000),
		AmountUSD:    decimal.NewFromFloat(10),
		AmountVND:    decimal.NewFromFloat(240000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
		DeltaQty:     decimal.NewFromFloat(-5),
		CashFlowUSD:  decimal.NewFromFloat(-10),
		CashFlowVND:  decimal.NewFromFloat(-240000),
		FXSource:     stringPtr("auto-fx-provider"),
		FXTimestamp:  &time.Time{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	// Insert test transaction
	err := service.CreateTransaction(ctx, testTx)
	if err != nil {
		t.Fatalf("Failed to create test transaction: %v", err)
	}

	// Test partial update - update multiple fields
	updateData := &models.Transaction{
		ID:           testTx.ID,
		Type:         "buy",
		Asset:        "BTC",
		Counterparty: stringPtr("New Shop"),
		Note:         stringPtr("Updated transaction"),
	}

	err = service.UpdateTransaction(ctx, updateData)
	if err != nil {
		t.Fatalf("Failed to update transaction: %v", err)
	}

	// Verify the update
	updated, err := service.GetTransaction(ctx, testTx.ID)
	if err != nil {
		t.Fatalf("Failed to get updated transaction: %v", err)
	}

	// Check that updated fields changed
	if updated.Type != "buy" {
		t.Errorf("Expected type to be 'buy', got '%s'", updated.Type)
	}
	if updated.Asset != "BTC" {
		t.Errorf("Expected asset to be 'BTC', got '%s'", updated.Asset)
	}
	if updated.Counterparty == nil || *updated.Counterparty != "New Shop" {
		t.Errorf("Expected counterparty to be 'New Shop', got %v", updated.Counterparty)
	}
	if updated.Note == nil || *updated.Note != "Updated transaction" {
		t.Errorf("Expected note to be 'Updated transaction', got %v", updated.Note)
	}

	// Check that preserved fields remained
	if updated.Quantity.String() != "5" {
		t.Errorf("Expected quantity to be preserved as '5', got '%s'", updated.Quantity.String())
	}
	if updated.Account != "Cash" {
		t.Errorf("Expected account to be preserved as 'Cash', got '%s'", updated.Account)
	}
}

func TestTransactionService_CreateTransaction_WithFees(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	// Create a BUY with fees; cashflow should be negative amount minus fees (amount+fee)
	tx := &models.Transaction{
		Date:       time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC),
		Type:       "buy",
		Asset:      "BTC",
		Account:    "Exchange",
		Quantity:   decimal.NewFromFloat(0.001),
		PriceLocal: decimal.NewFromFloat(67000),
		FXToUSD:    decimal.NewFromFloat(1.0),
		FXToVND:    decimal.NewFromFloat(24000),
		FeeUSD:     decimal.NewFromFloat(1.5),
		FeeVND:     decimal.NewFromFloat(36000),
	}

	if err := service.CreateTransaction(ctx, tx); err != nil {
		t.Fatalf("failed to create transaction: %v", err)
	}

	got, err := service.GetTransaction(ctx, tx.ID)
	if err != nil {
		t.Fatalf("failed to get transaction: %v", err)
	}

	// amount_usd = 0.001 * 67000 * 1 = 67
	if !got.AmountUSD.Equal(decimal.NewFromFloat(67)) {
		t.Fatalf("expected AmountUSD 67, got %s", got.AmountUSD.String())
	}

	// cashflow_usd = -(amount_usd + fee_usd) = -(67 + 1.5) = -68.5
	expectedCF := decimal.NewFromFloat(-68.5)
	if !got.CashFlowUSD.Equal(expectedCF) {
		t.Fatalf("expected CashFlowUSD %s, got %s", expectedCF.String(), got.CashFlowUSD.String())
	}
}

func TestTransactionService_UpdateTransactionNotFound(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	// Try to update non-existent transaction
	nonExistentUuid := uuid.New().String()
	updateData := &models.Transaction{
		ID:   nonExistentUuid,
		Type: "income",
	}

	err := service.UpdateTransaction(ctx, updateData)
	if err == nil {
		t.Error("Expected error when updating non-existent transaction")
	}

	expectedMsg := "no transaction found with id " + nonExistentUuid
	if err.Error() != expectedMsg {
		t.Errorf("Expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

// local stringPtr removed; using shared helper from testutil.go

func TestTransactionService_ExportTransactions(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	baseTime := time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC)

	// Create first transaction
	tx1 := &models.Transaction{
		Date:         baseTime,
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Store A"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Lunch"),
		Quantity:     decimal.NewFromFloat(1),
		PriceLocal:   decimal.NewFromFloat(10),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000),
		AmountUSD:    decimal.NewFromFloat(10),
		AmountVND:    decimal.NewFromFloat(240000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
		DeltaQty:     decimal.NewFromFloat(-1),
		CashFlowUSD:  decimal.NewFromFloat(-10),
		CashFlowVND:  decimal.NewFromFloat(-240000),
		FXSource:     stringPtr("auto-fx-provider"),
		FXTimestamp:  &time.Time{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := service.CreateTransaction(ctx, tx1); err != nil {
		t.Fatalf("failed to create tx1: %v", err)
	}

	// Create second transaction
	tx2 := &models.Transaction{
		Date:         baseTime.Add(24 * time.Hour),
		Type:         "income",
		Asset:        "USD",
		Account:      "Bank",
		Counterparty: stringPtr("Employer"),
		Tag:          stringPtr("Salary"),
		Note:         stringPtr("September"),
		Quantity:     decimal.NewFromFloat(1),
		PriceLocal:   decimal.NewFromFloat(1000),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000),
		AmountUSD:    decimal.NewFromFloat(1000),
		AmountVND:    decimal.NewFromFloat(24000000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
		DeltaQty:     decimal.NewFromFloat(0),
		CashFlowUSD:  decimal.NewFromFloat(1000),
		CashFlowVND:  decimal.NewFromFloat(24000000),
		FXSource:     stringPtr("auto-fx-provider"),
		FXTimestamp:  &time.Time{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := service.CreateTransaction(ctx, tx2); err != nil {
		t.Fatalf("failed to create tx2: %v", err)
	}

	// Export
	exported, err := service.ExportTransactions(ctx)
	if err != nil {
		t.Fatalf("ExportTransactions failed: %v", err)
	}
	if len(exported) != 2 {
		t.Fatalf("expected 2 transactions exported, got %d", len(exported))
	}
	// Basic sanity check that IDs are present
	if exported[0].ID == "" || exported[1].ID == "" {
		t.Fatalf("expected exported transactions to have IDs")
	}
}

func TestTransactionService_ImportTransactions_CreateAndUpsert(t *testing.T) {
	tdb := SetupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := services.NewTransactionService(tdb.database)

	// Import two new transactions (upsert=false)
	newTxs := []*models.Transaction{
		{
			Date:        time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC),
			Type:        "expense",
			Asset:       "USD",
			Account:     "Cash",
			Quantity:    decimal.NewFromFloat(2),
			PriceLocal:  decimal.NewFromFloat(5),
			FXToUSD:     decimal.NewFromFloat(1),
			FXToVND:     decimal.NewFromFloat(24000),
			AmountUSD:   decimal.NewFromFloat(10),
			AmountVND:   decimal.NewFromFloat(240000),
			FeeUSD:      decimal.Zero,
			FeeVND:      decimal.Zero,
			DeltaQty:    decimal.NewFromFloat(-2),
			CashFlowUSD: decimal.NewFromFloat(-10),
			CashFlowVND: decimal.NewFromFloat(-240000),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
		{
			Date:        time.Date(2024, 9, 2, 0, 0, 0, 0, time.UTC),
			Type:        "income",
			Asset:       "USD",
			Account:     "Bank",
			Quantity:    decimal.NewFromFloat(1),
			PriceLocal:  decimal.NewFromFloat(100),
			FXToUSD:     decimal.NewFromFloat(1),
			FXToVND:     decimal.NewFromFloat(24000),
			AmountUSD:   decimal.NewFromFloat(100),
			AmountVND:   decimal.NewFromFloat(2400000),
			FeeUSD:      decimal.Zero,
			FeeVND:      decimal.Zero,
			DeltaQty:    decimal.Zero,
			CashFlowUSD: decimal.NewFromFloat(100),
			CashFlowVND: decimal.NewFromFloat(2400000),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		},
	}
	createdCount, err := service.ImportTransactions(ctx, newTxs, false)
	if err != nil {
		t.Fatalf("ImportTransactions (create) failed: %v", err)
	}
	if createdCount != 2 {
		t.Fatalf("expected 2 created, got %d", createdCount)
	}

	// Create one existing transaction to upsert
	existing := &models.Transaction{
		Date:         time.Date(2024, 9, 3, 0, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Store B"),
		Quantity:     decimal.NewFromFloat(3),
		PriceLocal:   decimal.NewFromFloat(7),
		FXToUSD:      decimal.NewFromFloat(1),
		FXToVND:      decimal.NewFromFloat(24000),
		AmountUSD:    decimal.NewFromFloat(21),
		AmountVND:    decimal.NewFromFloat(504000),
		FeeUSD:       decimal.Zero,
		FeeVND:       decimal.Zero,
		DeltaQty:     decimal.NewFromFloat(-3),
		CashFlowUSD:  decimal.NewFromFloat(-21),
		CashFlowVND:  decimal.NewFromFloat(-504000),
		FXSource:     stringPtr("auto-fx-provider"),
		FXTimestamp:  &time.Time{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := service.CreateTransaction(ctx, existing); err != nil {
		t.Fatalf("failed to create existing tx: %v", err)
	}

	// Prepare upsert payload with the same ID but changed type
	upsertPayload := []*models.Transaction{
		{
			ID:          existing.ID,
			Type:        "income",
			Date:        existing.Date,
			Asset:       existing.Asset,
			Account:     existing.Account,
			Quantity:    existing.Quantity,
			PriceLocal:  existing.PriceLocal,
			FXToUSD:     existing.FXToUSD,
			FXToVND:     existing.FXToVND,
			AmountUSD:   existing.AmountUSD,
			AmountVND:   existing.AmountVND,
			FeeUSD:      existing.FeeUSD,
			FeeVND:      existing.FeeVND,
			DeltaQty:    existing.DeltaQty,
			CashFlowUSD: existing.CashFlowUSD,
			CashFlowVND: existing.CashFlowVND,
		},
	}

	upsertedCount, err := service.ImportTransactions(ctx, upsertPayload, true)
	if err != nil {
		t.Fatalf("ImportTransactions (upsert) failed: %v", err)
	}
	if upsertedCount != 1 {
		t.Fatalf("expected 1 upserted, got %d", upsertedCount)
	}

	// Verify the update took effect
	got, err := service.GetTransaction(ctx, existing.ID)
	if err != nil {
		t.Fatalf("failed to fetch upserted tx: %v", err)
	}
	if got.Type != "income" {
		t.Fatalf("expected type to be 'income' after upsert, got %s", got.Type)
	}
}
