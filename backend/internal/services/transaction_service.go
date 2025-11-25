package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
)

// transactionService implements the TransactionService interface
type transactionService struct {
	txRepo       repositories.TransactionRepository
	fxProvider   FXProvider
	priceService AssetPriceService
}

// NewTransactionService creates a new transaction service
func NewTransactionService(database *db.DB) TransactionService {
	return &transactionService{
		txRepo:       repositories.NewTransactionRepository(database),
		fxProvider:   nil, // No FX provider
		priceService: nil, // No price service
	}
}

// NewTransactionServiceWithFX creates a new transaction service with FX provider
func NewTransactionServiceWithFX(database *db.DB, fxProvider FXProvider) TransactionService {
	return &transactionService{
		txRepo:       repositories.NewTransactionRepository(database),
		fxProvider:   fxProvider,
		priceService: nil, // No price service
	}
}

// NewTransactionServiceWithFXAndPrices creates a new transaction service with FX and price providers
func NewTransactionServiceWithFXAndPrices(database *db.DB, fxProvider FXProvider, priceService AssetPriceService) TransactionService {
	return &transactionService{
		txRepo:       repositories.NewTransactionRepository(database),
		fxProvider:   fxProvider,
		priceService: priceService,
	}
}

// CreateTransaction creates a new transaction
func (s *transactionService) CreateTransaction(ctx context.Context, tx *models.Transaction) error {
	// Auto-populate local currency if not provided
	if tx.LocalCurrency == "" {
		tx.LocalCurrency = s.inferLocalCurrency(tx)
	}

	// Prepare transaction for saving (calculate derived fields and validate)
	if err := tx.PreSave(); err != nil {
		return fmt.Errorf("transaction validation failed: %w", err)
	}

	// Set timestamps
	now := time.Now()
	tx.CreatedAt = now
	tx.UpdatedAt = now

	return s.txRepo.Create(ctx, tx)
}

// CreateTransactionsBatch creates multiple transactions atomically and optionally links them.
func (s *transactionService) CreateTransactionsBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error) {
	if len(txs) == 0 {
		return nil, nil
	}

	// Prepare transactions
	for _, t := range txs {
		if t == nil {
			return nil, fmt.Errorf("nil transaction in batch")
		}
		// Auto-populate local currency if not provided
		if t.LocalCurrency == "" {
			t.LocalCurrency = s.inferLocalCurrency(t)
		}
		if e := t.PreSave(); e != nil {
			return nil, fmt.Errorf("transaction validation failed: %w", e)
		}
	}

	return s.txRepo.CreateBatch(ctx, txs, linkType)
}

// DeleteActionGroup deletes all transactions linked by an action group that includes oneID.
func (s *transactionService) DeleteActionGroup(ctx context.Context, oneID string) (int, error) {
	return s.txRepo.DeleteActionGroup(ctx, oneID)
}

// pqStringArray converts []string to a driver-friendly array parameter
func pqStringArray(items []string) interface{} {
	// Rely on pq array inference by using the pg-style array literal via sql package isn't straightforward here.
	// We can use the text[] cast pattern.
	// However, since we're using Exec with ANY($1), most drivers require pq.Array.
	// To avoid importing lib/pq here, we pass as []any for IN building; keep simple using ANY with text[] literal.
	// Fallback: build a text array literal. Ensure proper escaping is not needed for UUIDs.
	// NOTE: Using this helper for simplicity within this codebase; consider pq.Array in future.
	return interface{}(items)
}

// RecalculateFX recalculates FX rates and derived amounts for existing transactions.
// If onlyMissing is true, only updates rows where FX is zero for either USD or VND.
func (s *transactionService) RecalculateFX(ctx context.Context, onlyMissing bool) (int, error) {
	if s.fxProvider == nil {
		return 0, fmt.Errorf("no FX provider configured")
	}

	return s.txRepo.RecalculateFX(ctx, onlyMissing)
}

// RecalculateOneFX recalculates FX and derived fields for a single transaction by ID.
// If onlyMissing is true, preserves existing non-zero FX values; otherwise forces refresh.
// For cryptocurrencies, also refreshes the price_local from the price provider.
func (s *transactionService) RecalculateOneFX(ctx context.Context, id string, onlyMissing bool) (*models.Transaction, error) {
	if s.fxProvider == nil {
		return nil, fmt.Errorf("no FX provider configured")
	}

	return s.txRepo.RecalculateOneFX(ctx, id, onlyMissing)
}

// ExportTransactions returns all transactions
func (s *transactionService) ExportTransactions(ctx context.Context) ([]*models.Transaction, error) {
	txs, err := s.ListTransactions(ctx, nil)
	if err != nil {
		return nil, err
	}
	return txs, nil
}

// ImportTransactions imports transactions; when upsert is true, update existing by ID
func (s *transactionService) ImportTransactions(ctx context.Context, txs []*models.Transaction, upsert bool) (int, error) {
	if len(txs) == 0 {
		return 0, nil
	}
	count := 0
	for _, t := range txs {
		if upsert && t.ID != "" {
			// Try update existing minimal: re-use UpdateTransaction which merges and recalculates
			if err := s.UpdateTransaction(ctx, t); err == nil {
				count++
				continue
			}
			// fall through to create if update failed
		}
		if err := s.CreateTransaction(ctx, t); err == nil {
			count++
		}
	}
	return count, nil
}

// GetTransaction retrieves a transaction by ID
func (s *transactionService) GetTransaction(ctx context.Context, id string) (*models.Transaction, error) {
	return s.txRepo.GetByID(ctx, id)
}

// ListTransactions retrieves transactions based on filter criteria
func (s *transactionService) ListTransactions(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error) {
	return s.txRepo.List(ctx, filter)
}

// UpdateTransaction updates an existing transaction
func (s *transactionService) UpdateTransaction(ctx context.Context, tx *models.Transaction) error {
	if tx == nil || tx.ID == "" {
		return fmt.Errorf("no transaction found with id %s", "")
	}
	// First, get the existing transaction to merge with the update
	existing, err := s.GetTransaction(ctx, tx.ID)
	if err != nil {
		// If the underlying cause is not-found, standardize the error message expected by tests
		if strings.Contains(err.Error(), "transaction not found:") {
			return fmt.Errorf("no transaction found with id %s", tx.ID)
		}
		return fmt.Errorf("failed to get existing transaction: %w", err)
	}

	// Merge the update with existing data to ensure we have all required fields
	merged := s.mergeTransactionUpdate(existing, tx)

	// Recalculate derived fields and validate before persisting
	if err := merged.PreSave(); err != nil {
		return fmt.Errorf("transaction validation failed: %w", err)
	}

	// Update timestamp
	merged.UpdatedAt = time.Now()

	return s.txRepo.Update(ctx, merged)
}

// DeleteTransaction deletes a transaction by ID
func (s *transactionService) DeleteTransaction(ctx context.Context, id string) error {
	return s.txRepo.Delete(ctx, id)
}

// DeleteTransactions deletes multiple transactions by IDs
func (s *transactionService) DeleteTransactions(ctx context.Context, ids []string) (int, error) {
	// Normalize ids to non-empty strings
	filtered := make([]string, 0, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) != "" {
			filtered = append(filtered, id)
		}
	}
	if len(filtered) == 0 {
		return 0, nil
	}
	return s.txRepo.DeleteMany(ctx, filtered)
}

// GetTransactionCount returns the count of transactions matching the filter
func (s *transactionService) GetTransactionCount(ctx context.Context, filter *models.TransactionFilter) (int, error) {
	return s.txRepo.GetCount(ctx, filter)
}

// mergeTransactionUpdate merges an update transaction with the existing transaction
// Only non-zero/non-empty fields from the update are applied to the existing transaction
func (s *transactionService) mergeTransactionUpdate(existing, update *models.Transaction) *models.Transaction {
	// Start with a copy of the existing transaction
	merged := &models.Transaction{}
	*merged = *existing

	// Apply non-zero/non-empty updates
	if !update.Date.IsZero() {
		merged.Date = update.Date
	}
	if update.Type != "" {
		merged.Type = update.Type
	}
	if update.Asset != "" {
		merged.Asset = update.Asset
	}
	if update.Account != "" {
		merged.Account = update.Account
	}
	if update.Counterparty != nil && *update.Counterparty != "" {
		merged.Counterparty = update.Counterparty
	}
	if update.Tag != nil && *update.Tag != "" {
		merged.Tag = update.Tag
	}
	if update.Note != nil && *update.Note != "" {
		merged.Note = update.Note
	}
	if !update.Quantity.IsZero() {
		merged.Quantity = update.Quantity
	}
	if !update.PriceLocal.IsZero() {
		merged.PriceLocal = update.PriceLocal
	}
	if !update.FXToUSD.IsZero() {
		merged.FXToUSD = update.FXToUSD
	}
	if !update.FXToVND.IsZero() {
		merged.FXToVND = update.FXToVND
	}
	if !update.FeeUSD.IsZero() {
		merged.FeeUSD = update.FeeUSD
	}
	if !update.FeeVND.IsZero() {
		merged.FeeVND = update.FeeVND
	}
	if update.Horizon != nil && *update.Horizon != "" {
		merged.Horizon = update.Horizon
	}
	if update.EntryDate != nil && !update.EntryDate.IsZero() {
		merged.EntryDate = update.EntryDate
	}
	if update.ExitDate != nil && !update.ExitDate.IsZero() {
		merged.ExitDate = update.ExitDate
	}
	if update.FXImpact != nil && !update.FXImpact.IsZero() {
		merged.FXImpact = update.FXImpact
	}
	if update.FXSource != nil && *update.FXSource != "" {
		merged.FXSource = update.FXSource
	}
	if update.FXTimestamp != nil && !update.FXTimestamp.IsZero() {
		merged.FXTimestamp = update.FXTimestamp
	}

	return merged
}

// inferLocalCurrency determines the local currency for a transaction based on asset/account
func (s *transactionService) inferLocalCurrency(tx *models.Transaction) string {
	// For cryptocurrencies, default to USD as the standard trading currency
	if models.IsCryptocurrency(tx.Asset) {
		return "USD"
	}

	// For fiat assets, infer from asset name or account
	switch tx.Asset {
	case "VND", "USD", "EUR", "GBP", "JPY":
		return tx.Asset
	default:
		// Default to USD for unknown assets
		return "USD"
	}
}

// GetTransactionsFXEnhanced retrieves transactions with real-time FX conversion
func (s *transactionService) GetTransactionsFXEnhanced(ctx context.Context, filter *models.TransactionFilter, targetCurrencies []string) ([]*models.TransactionWithFX, error) {
	// Get base transactions
	txs, err := s.txRepo.List(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to get transactions: %w", err)
	}

	// Convert each transaction with FX rates
	var enhancedTxs []*models.TransactionWithFX
	for _, tx := range txs {
		enhancedTx, err := s.convertTransactionWithFX(ctx, tx, targetCurrencies)
		if err != nil {
			// Log error but continue with other transactions
			fmt.Printf("Warning: failed to convert transaction %s with FX: %v\n", tx.ID, err)
			// Add transaction without FX conversion
			enhancedTx = &models.TransactionWithFX{
				Transaction: *tx,
				FXRates:      make(map[string]decimal.Decimal),
			}
		}
		enhancedTxs = append(enhancedTxs, enhancedTx)
	}

	return enhancedTxs, nil
}

// convertTransactionWithFX converts a single transaction with FX rates
func (s *transactionService) convertTransactionWithFX(ctx context.Context, tx *models.Transaction, targetCurrencies []string) (*models.TransactionWithFX, error) {
	if s.fxProvider == nil {
		// No FX provider, return transaction without conversion
		return &models.TransactionWithFX{
			Transaction: *tx,
			FXRates:      make(map[string]decimal.Decimal),
		}, nil
	}

	// Build FX rate map
	fxRates := make(map[string]decimal.Decimal)

	// Get rates needed for conversion
	rateTargets := []string{}
	for _, currency := range targetCurrencies {
		if currency != tx.LocalCurrency {
			rateTargets = append(rateTargets, currency)
		}
	}

	// Add USD-VND rate as common conversion pair
	if tx.LocalCurrency == "USD" || tx.LocalCurrency == "VND" {
		if containsString(targetCurrencies, "USD") && containsString(targetCurrencies, "VND") {
			if !containsString(rateTargets, "VND") && tx.LocalCurrency == "USD" {
				rateTargets = append(rateTargets, "VND")
			}
			if !containsString(rateTargets, "USD") && tx.LocalCurrency == "VND" {
				rateTargets = append(rateTargets, "USD")
			}
		}
	}

	// Fetch FX rates
	if len(rateTargets) > 0 {
		fetchedRates, err := s.fxProvider.GetRates(ctx, tx.LocalCurrency, rateTargets, tx.Date)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch FX rates: %w", err)
		}

		// Build rate map with standard keys
		for _, target := range rateTargets {
			if rate, exists := fetchedRates[target]; exists {
				key := fmt.Sprintf("%s-%s", tx.LocalCurrency, target)
				fxRates[key] = rate
				// Add inverse rate
				inverseKey := fmt.Sprintf("%s-%s", target, tx.LocalCurrency)
				fxRates[inverseKey] = decimal.NewFromInt(1).Div(rate)
			}
		}
	}

	return &models.TransactionWithFX{
		Transaction: *tx,
		FXRates:     fxRates,
	}, nil
}

// containsString checks if a string is in a slice
func containsString(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}
