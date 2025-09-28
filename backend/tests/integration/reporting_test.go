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

func TestReportingReflectsTransactionChanges(t *testing.T) {
	// Setup test database with testcontainers
	tc := SetupTestContainer(t)
	defer tc.Cleanup(t)

	database := &db.DB{DB: tc.DB}

	transactionService := services.NewTransactionService(database)
	ctx := context.Background()

	// Clean up any existing test transactions
	defer cleanupTestTransactions(t, transactionService, ctx)

	t.Run("Holdings Reflect Transaction Changes", func(t *testing.T) {
		// Create a BTC purchase
		btcPurchase := models.Transaction{
			Date:         time.Now().UTC(),
			Type:         "buy",
			Asset:        "BTC",
			Account:      "Test Wallet",
			Counterparty: stringPtr("Test Exchange"),
			Tag:          stringPtr("Testing"),
			Note:         stringPtr("Test BTC purchase for holdings"),
			Quantity:     mustDecimal("2.0"),
			PriceLocal:   mustDecimal("50000"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("50.0"),
			FeeVND:       mustDecimal("1200000.0"),
		}

		err := transactionService.CreateTransaction(ctx, &btcPurchase)
		if err != nil {
			t.Fatalf("Failed to create BTC purchase: %v", err)
		}

		// Verify holdings calculation
		// Get all BTC transactions to calculate expected holding
		filter := &models.TransactionFilter{
			Assets: []string{"BTC"},
		}
		btcTransactions, err := transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list BTC transactions: %v", err)
		}

		// Calculate expected BTC holding
		var totalBTCHolding decimal.Decimal
		for _, tx := range btcTransactions {
			totalBTCHolding = totalBTCHolding.Add(tx.DeltaQty)
		}

		// Our purchase should contribute +2.0 BTC
		if totalBTCHolding.LessThan(mustDecimal("2.0")) {
			t.Errorf("Expected BTC holding to include at least 2.0, got %s", totalBTCHolding)
		}

		// Create a BTC sale
		btcSale := models.Transaction{
			Date:         time.Now().UTC().Add(time.Hour),
			Type:         "sell",
			Asset:        "BTC",
			Account:      "Test Wallet",
			Counterparty: stringPtr("Test Exchange"),
			Tag:          stringPtr("Testing"),
			Note:         stringPtr("Test BTC sale for holdings"),
			Quantity:     mustDecimal("0.5"),
			PriceLocal:   mustDecimal("52000"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("25.0"),
			FeeVND:       mustDecimal("600000.0"),
		}

		err = transactionService.CreateTransaction(ctx, &btcSale)
		if err != nil {
			t.Fatalf("Failed to create BTC sale: %v", err)
		}

		// Recalculate holdings after sale
		btcTransactions, err = transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list BTC transactions after sale: %v", err)
		}

		totalBTCHolding = decimal.Zero
		for _, tx := range btcTransactions {
			totalBTCHolding = totalBTCHolding.Add(tx.DeltaQty)
		}

		// Check that our transactions contributed the expected net amount
		ourTransactionDelta := btcPurchase.DeltaQty.Add(btcSale.DeltaQty)
		expectedOurDelta := mustDecimal("1.5") // 2.0 - 0.5

		if !ourTransactionDelta.Equal(expectedOurDelta) {
			t.Errorf("Expected our transaction delta to be %s, got %s", expectedOurDelta, ourTransactionDelta)
		}
	})

	t.Run("Cash Flow Reports Reflect Transaction Changes", func(t *testing.T) {
		initialDate := time.Now().UTC().Truncate(24 * time.Hour)

		// Create income transaction
		income := models.Transaction{
			Date:         initialDate,
			Type:         "income",
			Asset:        "USD",
			Account:      "Test Bank",
			Counterparty: stringPtr("Test Employer"),
			Tag:          stringPtr("Salary"),
			Note:         stringPtr("Test salary for cash flow"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("3000"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		err := transactionService.CreateTransaction(ctx, &income)
		if err != nil {
			t.Fatalf("Failed to create income transaction: %v", err)
		}

		// Create expense transaction
		expense := models.Transaction{
			Date:         initialDate.Add(2 * time.Hour),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Test Cash",
			Counterparty: stringPtr("Test Store"),
			Tag:          stringPtr("Food"),
			Note:         stringPtr("Test expense for cash flow"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("100"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		err = transactionService.CreateTransaction(ctx, &expense)
		if err != nil {
			t.Fatalf("Failed to create expense transaction: %v", err)
		}

		// Calculate cash flow for the day
		dayStart := initialDate
		dayEnd := initialDate.Add(24 * time.Hour)

		filter := &models.TransactionFilter{
			StartDate: &dayStart,
			EndDate:   &dayEnd,
		}

		dayTransactions, err := transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list day transactions: %v", err)
		}

		var totalCashFlowUSD, totalCashFlowVND decimal.Decimal
		var incomeFlowUSD, expenseFlowUSD decimal.Decimal

		for _, tx := range dayTransactions {
			totalCashFlowUSD = totalCashFlowUSD.Add(tx.CashFlowUSD)
			totalCashFlowVND = totalCashFlowVND.Add(tx.CashFlowVND)

			if tx.Type == "income" {
				incomeFlowUSD = incomeFlowUSD.Add(tx.CashFlowUSD)
			} else if tx.Type == "expense" {
				expenseFlowUSD = expenseFlowUSD.Add(tx.CashFlowUSD)
			}
		}

		// Verify our test transactions are included
		// Income should contribute +$3000, expense should contribute -$100
		expectedIncomeContribution := mustDecimal("3000")
		expectedExpenseContribution := mustDecimal("-100")

		// Check that our income transaction contributed positively
		if incomeFlowUSD.LessThan(expectedIncomeContribution) {
			t.Errorf("Expected income cash flow to include at least %s, got %s", expectedIncomeContribution, incomeFlowUSD)
		}

		// Check that our expense transaction contributed negatively
		if expenseFlowUSD.GreaterThan(expectedExpenseContribution) {
			t.Errorf("Expected expense cash flow to be at most %s, got %s", expectedExpenseContribution, expenseFlowUSD)
		}
	})

	t.Run("Transaction Type Filtering Affects Reports", func(t *testing.T) {
		testDate := time.Now().UTC().Truncate(24 * time.Hour)

		// Create transactions of different types
		transactions := []models.Transaction{
			{
				Date:         testDate,
				Type:         "buy",
				Asset:        "ETH",
				Account:      "Test Exchange",
				Counterparty: stringPtr("Exchange"),
				Tag:          stringPtr("Trading"),
				Note:         stringPtr("ETH purchase"),
				Quantity:     mustDecimal("1"),
				PriceLocal:   mustDecimal("2000"),
				FXToUSD:      mustDecimal("1.0"),
				FXToVND:      mustDecimal("24000.0"),
				FeeUSD:       mustDecimal("10"),
				FeeVND:       mustDecimal("240000"),
			},
			{
				Date:         testDate.Add(time.Hour),
				Type:         "sell",
				Asset:        "ETH",
				Account:      "Test Exchange",
				Counterparty: stringPtr("Exchange"),
				Tag:          stringPtr("Trading"),
				Note:         stringPtr("ETH sale"),
				Quantity:     mustDecimal("0.5"),
				PriceLocal:   mustDecimal("2100"),
				FXToUSD:      mustDecimal("1.0"),
				FXToVND:      mustDecimal("24000.0"),
				FeeUSD:       mustDecimal("5"),
				FeeVND:       mustDecimal("120000"),
			},
		}

		var createdTransactions []models.Transaction
		for _, tx := range transactions {
			err := transactionService.CreateTransaction(ctx, &tx)
			if err != nil {
				t.Fatalf("Failed to create transaction %s: %v", tx.Type, err)
			}
			createdTransactions = append(createdTransactions, tx)
		}

		// Test filtering by type
		testDateEnd2 := testDate.Add(24 * time.Hour)
		buyFilter := &models.TransactionFilter{
			Types:     []string{"buy"},
			StartDate: &testDate,
			EndDate:   &testDateEnd2,
		}

		buyTransactions, err := transactionService.ListTransactions(ctx, buyFilter)
		if err != nil {
			t.Fatalf("Failed to list buy transactions: %v", err)
		}

		// Verify only buy transactions are returned
		for _, tx := range buyTransactions {
			if tx.Type != "buy" {
				t.Errorf("Expected only 'buy' transactions, found '%s'", tx.Type)
			}
		}

		// Calculate cash flow for buy transactions only
		var buyCashFlowUSD decimal.Decimal
		for _, tx := range buyTransactions {
			buyCashFlowUSD = buyCashFlowUSD.Add(tx.CashFlowUSD)
		}

		// Buy transactions should have negative cash flow
		if buyCashFlowUSD.GreaterThanOrEqual(decimal.Zero) {
			t.Errorf("Expected buy transactions to have negative cash flow, got %s", buyCashFlowUSD)
		}

		// Test filtering by sell type
		testDateEnd := testDate.Add(24 * time.Hour)
		sellFilter := &models.TransactionFilter{
			Types:     []string{"sell"},
			StartDate: &testDate,
			EndDate:   &testDateEnd,
		}

		sellTransactions, err := transactionService.ListTransactions(ctx, sellFilter)
		if err != nil {
			t.Fatalf("Failed to list sell transactions: %v", err)
		}

		// Calculate cash flow for sell transactions only
		var sellCashFlowUSD decimal.Decimal
		for _, tx := range sellTransactions {
			sellCashFlowUSD = sellCashFlowUSD.Add(tx.CashFlowUSD)
		}

		// Sell transactions should have positive cash flow
		if sellCashFlowUSD.LessThanOrEqual(decimal.Zero) {
			t.Errorf("Expected sell transactions to have positive cash flow, got %s", sellCashFlowUSD)
		}
	})

	t.Run("Account-Based Holdings Calculation", func(t *testing.T) {
		testDate := time.Now().UTC()

		// Create transactions in different accounts
		account1Transaction := models.Transaction{
			Date:         testDate,
			Type:         "deposit",
			Asset:        "USDT",
			Account:      "Test Account 1",
			Counterparty: stringPtr("External"),
			Tag:          stringPtr("Transfer"),
			Note:         stringPtr("USDT deposit to account 1"),
			Quantity:     mustDecimal("1000"),
			PriceLocal:   mustDecimal("1"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		account2Transaction := models.Transaction{
			Date:         testDate.Add(time.Hour),
			Type:         "deposit",
			Asset:        "USDT",
			Account:      "Test Account 2",
			Counterparty: stringPtr("External"),
			Tag:          stringPtr("Transfer"),
			Note:         stringPtr("USDT deposit to account 2"),
			Quantity:     mustDecimal("500"),
			PriceLocal:   mustDecimal("1"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		err := transactionService.CreateTransaction(ctx, &account1Transaction)
		if err != nil {
			t.Fatalf("Failed to create account 1 transaction: %v", err)
		}

		err = transactionService.CreateTransaction(ctx, &account2Transaction)
		if err != nil {
			t.Fatalf("Failed to create account 2 transaction: %v", err)
		}

		// Test filtering by account
		account1Filter := &models.TransactionFilter{
			Accounts: []string{"Test Account 1"},
			Assets:   []string{"USDT"},
		}

		account1Transactions, err := transactionService.ListTransactions(ctx, account1Filter)
		if err != nil {
			t.Fatalf("Failed to list account 1 transactions: %v", err)
		}

		// Calculate holdings for account 1
		var account1Holdings decimal.Decimal
		for _, tx := range account1Transactions {
			if tx.Asset == "USDT" {
				account1Holdings = account1Holdings.Add(tx.DeltaQty)
			}
		}

		// Account 1 should have at least 1000 USDT from our transaction
		expectedMinAccount1 := mustDecimal("1000")
		if account1Holdings.LessThan(expectedMinAccount1) {
			t.Errorf("Expected account 1 to have at least %s USDT, got %s", expectedMinAccount1, account1Holdings)
		}

		// Test filtering by account 2
		account2Filter := &models.TransactionFilter{
			Accounts: []string{"Test Account 2"},
			Assets:   []string{"USDT"},
		}

		account2Transactions, err := transactionService.ListTransactions(ctx, account2Filter)
		if err != nil {
			t.Fatalf("Failed to list account 2 transactions: %v", err)
		}

		// Calculate holdings for account 2
		var account2Holdings decimal.Decimal
		for _, tx := range account2Transactions {
			if tx.Asset == "USDT" {
				account2Holdings = account2Holdings.Add(tx.DeltaQty)
			}
		}

		// Account 2 should have at least 500 USDT from our transaction
		expectedMinAccount2 := mustDecimal("500")
		if account2Holdings.LessThan(expectedMinAccount2) {
			t.Errorf("Expected account 2 to have at least %s USDT, got %s", expectedMinAccount2, account2Holdings)
		}
	})

	t.Run("Transaction Updates Affect Reports", func(t *testing.T) {
		// Create a transaction
		originalTransaction := models.Transaction{
			Date:         time.Now().UTC(),
			Type:         "income",
			Asset:        "USD",
			Account:      "Test Update Account",
			Counterparty: stringPtr("Original Employer"),
			Tag:          stringPtr("Salary"),
			Note:         stringPtr("Original income"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("1000"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		err := transactionService.CreateTransaction(ctx, &originalTransaction)
		if err != nil {
			t.Fatalf("Failed to create original transaction: %v", err)
		}

		// Get initial cash flow
		filter := &models.TransactionFilter{
			Accounts: []string{"Test Update Account"},
		}

		transactions, err := transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list transactions: %v", err)
		}

		var initialCashFlow decimal.Decimal
		for _, tx := range transactions {
			if tx.ID == originalTransaction.ID {
				initialCashFlow = tx.CashFlowUSD
				break
			}
		}

		// Update the transaction with different amount
		updatedTransaction := originalTransaction
		updatedTransaction.PriceLocal = mustDecimal("2000") // Double the amount

		err = transactionService.UpdateTransaction(ctx, &updatedTransaction)
		if err != nil {
			t.Fatalf("Failed to update transaction: %v", err)
		}

		// Get updated cash flow
		transactions, err = transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list updated transactions: %v", err)
		}

		var updatedCashFlow decimal.Decimal
		for _, tx := range transactions {
			if tx.ID == originalTransaction.ID {
				updatedCashFlow = tx.CashFlowUSD
				break
			}
		}

		// Updated cash flow should be different (doubled)
		expectedUpdatedCashFlow := mustDecimal("2000")
		if !updatedCashFlow.Equal(expectedUpdatedCashFlow) {
			t.Errorf("Expected updated cash flow to be %s, got %s", expectedUpdatedCashFlow, updatedCashFlow)
		}

		// Verify the change
		if updatedCashFlow.Equal(initialCashFlow) {
			t.Error("Cash flow should have changed after transaction update")
		}
	})

	t.Run("Transaction Deletion Affects Reports", func(t *testing.T) {
		// Create a transaction to delete
		transactionToDelete := models.Transaction{
			Date:         time.Now().UTC(),
			Type:         "expense",
			Asset:        "USD",
			Account:      "Test Delete Account",
			Counterparty: stringPtr("To Be Deleted"),
			Tag:          stringPtr("Test"),
			Note:         stringPtr("Transaction to delete"),
			Quantity:     mustDecimal("1"),
			PriceLocal:   mustDecimal("200"),
			FXToUSD:      mustDecimal("1.0"),
			FXToVND:      mustDecimal("24000.0"),
			FeeUSD:       mustDecimal("0"),
			FeeVND:       mustDecimal("0"),
		}

		err := transactionService.CreateTransaction(ctx, &transactionToDelete)
		if err != nil {
			t.Fatalf("Failed to create transaction to delete: %v", err)
		}

		// Verify transaction exists in reports
		filter := &models.TransactionFilter{
			Accounts: []string{"Test Delete Account"},
		}

		transactions, err := transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list transactions before deletion: %v", err)
		}

		found := false
		for _, tx := range transactions {
			if tx.ID == transactionToDelete.ID {
				found = true
				break
			}
		}

		if !found {
			t.Fatal("Transaction not found before deletion")
		}

		// Delete the transaction
		err = transactionService.DeleteTransaction(ctx, transactionToDelete.ID)
		if err != nil {
			t.Fatalf("Failed to delete transaction: %v", err)
		}

		// Verify transaction no longer exists in reports
		transactions, err = transactionService.ListTransactions(ctx, filter)
		if err != nil {
			t.Fatalf("Failed to list transactions after deletion: %v", err)
		}

		for _, tx := range transactions {
			if tx.ID == transactionToDelete.ID {
				t.Error("Deleted transaction still appears in reports")
			}
		}
	})
}

// Helper function to clean up test transactions
func cleanupTestTransactions(t *testing.T, service services.TransactionService, ctx context.Context) {
	// Clean up transactions with test-related counterparties
	testCounterparties := []string{
		"Test Exchange", "Test Employer", "Test Store", "Exchange",
		"External", "Original Employer", "To Be Deleted",
	}

	for _, counterparty := range testCounterparties {
		filter := &models.TransactionFilter{
			Counterparty: &counterparty,
		}

		transactions, err := service.ListTransactions(ctx, filter)
		if err != nil {
			continue // Skip cleanup errors
		}

		for _, tx := range transactions {
			service.DeleteTransaction(ctx, tx.ID)
		}
	}

	// Clean up transactions with test accounts
	testAccounts := []string{
		"Test Wallet", "Test Bank", "Test Cash", "Test Exchange",
		"Test Account 1", "Test Account 2", "Test Update Account", "Test Delete Account",
	}

	for _, account := range testAccounts {
		filter := &models.TransactionFilter{
			Accounts: []string{account},
		}

		transactions, err := service.ListTransactions(ctx, filter)
		if err != nil {
			continue // Skip cleanup errors
		}

		for _, tx := range transactions {
			service.DeleteTransaction(ctx, tx.ID)
		}
	}
}
