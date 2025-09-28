package services

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

type testDB struct {
	container testcontainers.Container
	database  *db.DB
}

func setupTestDB(t *testing.T) *testDB {
	ctx := context.Background()

	// Start PostgreSQL container
	pgContainer, err := postgres.Run(ctx,
		"postgres:15-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("testuser"),
		postgres.WithPassword("testpass"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(5*time.Second)),
	)
	if err != nil {
		t.Fatalf("Failed to start PostgreSQL container: %v", err)
	}

	// Get connection string
	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("Failed to get connection string: %v", err)
	}

	// Connect to database
	sqlDB, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	// Create database wrapper
	database := &db.DB{DB: sqlDB}

	// Create tables
	if err := setupTestTables(database); err != nil {
		t.Fatalf("Failed to setup test tables: %v", err)
	}

	return &testDB{
		container: pgContainer,
		database:  database,
	}
}

func (tdb *testDB) cleanup(t *testing.T) {
	ctx := context.Background()
	if err := tdb.container.Terminate(ctx); err != nil {
		t.Errorf("Failed to terminate container: %v", err)
	}
}

func setupTestTables(database *db.DB) error {
	// Create transactions table
	query := `
		CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			date TIMESTAMP NOT NULL,
			type TEXT NOT NULL,
			asset TEXT NOT NULL,
			account TEXT NOT NULL,
			counterparty TEXT,
			tag TEXT,
			note TEXT,
			quantity DECIMAL(20,10) NOT NULL DEFAULT 0,
			price_local DECIMAL(20,10) NOT NULL DEFAULT 0,
			amount_local DECIMAL(20,10) NOT NULL DEFAULT 0,
			fx_to_usd DECIMAL(20,10) NOT NULL DEFAULT 1,
			fx_to_vnd DECIMAL(20,10) NOT NULL DEFAULT 24000,
			amount_usd DECIMAL(20,10) NOT NULL DEFAULT 0,
			amount_vnd DECIMAL(20,10) NOT NULL DEFAULT 0,
			fee_usd DECIMAL(20,10) NOT NULL DEFAULT 0,
			fee_vnd DECIMAL(20,10) NOT NULL DEFAULT 0,
			delta_qty DECIMAL(20,10) NOT NULL DEFAULT 0,
			cashflow_usd DECIMAL(20,10) NOT NULL DEFAULT 0,
			cashflow_vnd DECIMAL(20,10) NOT NULL DEFAULT 0,
			horizon TEXT,
			entry_date TIMESTAMP,
			exit_date TIMESTAMP,
			fx_impact DECIMAL(20,10),
			fx_source TEXT,
			fx_timestamp TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`

	_, err := database.Exec(query)
	return err
}

func TestTransactionService_UpdateTransaction(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := NewTransactionService(tdb.database)

	// Create a test transaction
	testTx := &models.Transaction{
		ID:           "test-123",
		Date:         time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Test Shop"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Test transaction"),
		Quantity:     decimal.NewFromFloat(10),
		PriceLocal:   decimal.NewFromFloat(1),
		AmountLocal:  decimal.NewFromFloat(10),
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
		ID:   "test-123",
		Type: "income",
	}

	err = service.UpdateTransaction(ctx, updateData)
	if err != nil {
		t.Fatalf("Failed to update transaction: %v", err)
	}

	// Verify the update
	updated, err := service.GetTransaction(ctx, "test-123")
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
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := NewTransactionService(tdb.database)

	// Create a test transaction
	testTx := &models.Transaction{
		ID:           "test-456",
		Date:         time.Date(2024, 9, 26, 0, 0, 0, 0, time.UTC),
		Type:         "expense",
		Asset:        "USD",
		Account:      "Cash",
		Counterparty: stringPtr("Old Shop"),
		Tag:          stringPtr("Food"),
		Note:         stringPtr("Old transaction"),
		Quantity:     decimal.NewFromFloat(5),
		PriceLocal:   decimal.NewFromFloat(2),
		AmountLocal:  decimal.NewFromFloat(10),
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
		ID:           "test-456",
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
	updated, err := service.GetTransaction(ctx, "test-456")
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

func TestTransactionService_UpdateTransactionNotFound(t *testing.T) {
	tdb := setupTestDB(t)
	defer tdb.cleanup(t)

	ctx := context.Background()
	service := NewTransactionService(tdb.database)

	// Try to update non-existent transaction
	updateData := &models.Transaction{
		ID:   "non-existent",
		Type: "income",
	}

	err := service.UpdateTransaction(ctx, updateData)
	if err == nil {
		t.Error("Expected error when updating non-existent transaction")
	}

	expectedMsg := "no transaction found with id non-existent"
	if err.Error() != expectedMsg {
		t.Errorf("Expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

func stringPtr(s string) *string {
	return &s
}
