package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type TransactionHandler struct {
	service services.TransactionService
}

func NewTransactionHandler(service services.TransactionService) *TransactionHandler {
	return &TransactionHandler{service: service}
}

func (h *TransactionHandler) HandleTransactions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listTransactions(w, r)
	case "POST":
		h.createTransaction(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

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

	if err := h.service.CreateTransaction(r.Context(), &tx); err != nil {
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
