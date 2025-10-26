package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type TransactionHandler struct {
	service services.TransactionService
}

func NewTransactionHandler(service services.TransactionService) *TransactionHandler {
	return &TransactionHandler{service: service}
}

// validateQuickExpense validates and sets defaults for quick expense entries
func validateQuickExpense(tx *models.Transaction) error {
	// Ensure essential fields are present for quick expense
	if tx.Type == "expense" {
		if tx.AmountLocal.IsZero() {
			return errors.New("expense amount is required")
		}
		if tx.Asset == "" {
			return errors.New("asset is required for expense")
		}
		if tx.Account == "" {
			return errors.New("account is required for expense")
		}

		// Set default values for quick expense
		if tx.Quantity.IsZero() {
			tx.Quantity = decimal.NewFromInt(1)
		}

		// Only set FX defaults for regular expenses, not for repay_borrow
		// repay_borrow actions use FX zero and expect TransactionService to auto-populate
		if tx.FXToUSD.IsZero() && tx.Type != "repay_borrow" {
			tx.FXToUSD = decimal.NewFromInt(1)
		}
		if tx.FXToVND.IsZero() && tx.Type != "repay_borrow" {
			// Don't hardcode FX rates - let TransactionService.populateFXRates fetch real rates from provider
			// Previously: tx.FXToVND = decimal.NewFromInt(24000) - This was incorrect
			// Remove hardcoded rates to allow real FX rates to be used
		}
	}

	return nil
}

// HandleTransactions handles collection-level operations for transactions.
// @Summary List or create transactions
// @Description Get a list of transactions or create a new one
// @Tags transactions
// @Accept json
// @Produce json
// @Param start_date query string false "Start date (YYYY-MM-DD)"
// @Param end_date query string false "End date (YYYY-MM-DD)"
// @Param types query string false "Comma-separated transaction types"
// @Param assets query string false "Comma-separated asset symbols"
// @Param accounts query string false "Comma-separated account names"
// @Param tags query string false "Comma-separated tag names"
// @Param counterparty query string false "Counterparty name"
// @Param limit query int false "Limit"
// @Param offset query int false "Offset"
// @Success 200 {array} models.Transaction
// @Failure 400 {string} string "Invalid request"
// @Failure 500 {string} string "Internal server error"
// @Router /transactions [get]
// @Router /transactions [post]
func (h *TransactionHandler) HandleTransactions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listTransactions(w, r)
	case "POST":
		h.createTransaction(w, r)
	case "DELETE":
		// Support bulk delete via JSON body: { "ids": ["id1","id2",...] }
		var payload struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.IDs) == 0 {
			http.Error(w, "Invalid JSON body; expected {\"ids\":[...]} ", http.StatusBadRequest)
			return
		}
		count, err := h.service.DeleteTransactions(r.Context(), payload.IDs)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{"deleted": count})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// HandleTransaction handles item-level operations for a transaction.
// @Summary Get, update, or delete a transaction
// @Description Operate on a single transaction by ID
// @Tags transactions
// @Accept json
// @Produce json
// @Param id path string true "Transaction ID"
// @Success 200 {object} models.Transaction
// @Failure 400 {string} string "Bad request"
// @Failure 404 {string} string "Not found"
// @Failure 500 {string} string "Internal server error"
// @Router /transactions/{id} [get]
// @Router /transactions/{id} [put]
// @Router /transactions/{id} [delete]
func (h *TransactionHandler) HandleTransaction(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/transactions/")
	id := strings.Split(path, "/")[0]

	if id == "" {
		http.Error(w, "Transaction ID is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		h.getTransaction(w, r, id)
	case "PUT":
		h.updateTransaction(w, r, id)
	case "DELETE":
		h.deleteTransaction(w, r, id)
	case "POST":
		// Support: /api/transactions/{id}/recalc?only_missing=true|false
		if strings.HasSuffix(r.URL.Path, "/recalc") {
			onlyMissing := true
			if q := r.URL.Query().Get("only_missing"); q == "false" {
				onlyMissing = false
			}
			tx, err := h.service.RecalculateOneFX(r.Context(), id, onlyMissing)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(tx)
			return
		}

		// Support: /api/transactions/{id}/mark-borrow-inactive
		if strings.HasSuffix(r.URL.Path, "/mark-borrow-inactive") {
			update := &models.Transaction{BorrowActive: new(bool)}
			*update.BorrowActive = false
			update.ID = id
			if err := h.service.UpdateTransaction(r.Context(), update); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok"}`))
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *TransactionHandler) listTransactions(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for filtering
	filter := &models.TransactionFilter{}

	if startDate := r.URL.Query().Get("start_date"); startDate != "" {
		if date, err := time.Parse("2006-01-02", startDate); err == nil {
			filter.StartDate = &date
		}
	}

	if endDate := r.URL.Query().Get("end_date"); endDate != "" {
		if date, err := time.Parse("2006-01-02", endDate); err == nil {
			filter.EndDate = &date
		}
	}

	if types := r.URL.Query().Get("types"); types != "" {
		filter.Types = strings.Split(types, ",")
	}

	if assets := r.URL.Query().Get("assets"); assets != "" {
		filter.Assets = strings.Split(assets, ",")
	}

	if accounts := r.URL.Query().Get("accounts"); accounts != "" {
		filter.Accounts = strings.Split(accounts, ",")
	}

	if tags := r.URL.Query().Get("tags"); tags != "" {
		filter.Tags = strings.Split(tags, ",")
	}

	if counterparty := r.URL.Query().Get("counterparty"); counterparty != "" {
		filter.Counterparty = &counterparty
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = limit
		}
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = offset
		}
	}

	transactions, err := h.service.ListTransactions(r.Context(), filter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(transactions)
}

func (h *TransactionHandler) createTransaction(w http.ResponseWriter, r *http.Request) {
	var tx models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate quick expense entries and set defaults
	if err := validateQuickExpense(&tx); err != nil {
		http.Error(w, "Quick expense validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateTransaction(r.Context(), &tx); err != nil {
		// Map known validation errors to 400
		if strings.Contains(err.Error(), "transaction validation failed:") ||
			strings.Contains(err.Error(), "date is required") ||
			strings.Contains(err.Error(), "type is required") ||
			strings.Contains(err.Error(), "asset is required") ||
			strings.Contains(err.Error(), "account is required") ||
			strings.Contains(err.Error(), "quantity must be non-zero") ||
			strings.Contains(err.Error(), "price must be non-negative") ||
			strings.Contains(err.Error(), "FX to USD rate is required") ||
			strings.Contains(err.Error(), "FX to VND rate is required") ||
			strings.Contains(err.Error(), "horizon must be") ||
			strings.Contains(err.Error(), "borrow_") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(&tx)
}

func (h *TransactionHandler) getTransaction(w http.ResponseWriter, r *http.Request, id string) {
	tx, err := h.service.GetTransaction(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if tx == nil {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(tx)
}

func (h *TransactionHandler) updateTransaction(w http.ResponseWriter, r *http.Request, id string) {
	var tx models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	tx.ID = id
	if err := h.service.UpdateTransaction(r.Context(), &tx); err != nil {
		// Not found mapping
		if strings.Contains(err.Error(), "no transaction found with id") ||
			strings.Contains(err.Error(), "transaction not found:") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		// Validation mapping
		if strings.Contains(err.Error(), "transaction validation failed:") ||
			strings.Contains(err.Error(), "date is required") ||
			strings.Contains(err.Error(), "type is required") ||
			strings.Contains(err.Error(), "asset is required") ||
			strings.Contains(err.Error(), "account is required") ||
			strings.Contains(err.Error(), "quantity must be non-zero") ||
			strings.Contains(err.Error(), "price must be non-negative") ||
			strings.Contains(err.Error(), "FX to USD rate is required") ||
			strings.Contains(err.Error(), "FX to VND rate is required") ||
			strings.Contains(err.Error(), "horizon must be") ||
			strings.Contains(err.Error(), "borrow_") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(&tx)
}

func (h *TransactionHandler) deleteTransaction(w http.ResponseWriter, r *http.Request, id string) {
	if err := h.service.DeleteTransaction(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
