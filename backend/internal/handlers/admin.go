package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type AdminHandler struct {
	service   services.AdminService
	txService services.TransactionService
}

func NewAdminHandler(service services.AdminService) *AdminHandler {
	return &AdminHandler{service: service}
}

// NewAdminHandlerWithTx allows wiring transaction service for maintenance tasks
func NewAdminHandlerWithTx(admin services.AdminService, tx services.TransactionService) *AdminHandler {
	return &AdminHandler{service: admin, txService: tx}
}

// Transaction Types handlers
func (h *AdminHandler) HandleTransactionTypes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listTransactionTypes(w, r)
	case "POST":
		h.createTransactionType(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) HandleTransactionType(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Extract ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/types/")
	idStr := strings.Split(path, "/")[0]

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid transaction type ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		h.getTransactionType(w, r, id)
	case "PUT":
		h.updateTransactionType(w, r, id)
	case "DELETE":
		h.deleteTransactionType(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) listTransactionTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.service.ListTransactionTypes(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(types)
}

func (h *AdminHandler) createTransactionType(w http.ResponseWriter, r *http.Request) {
	var tt models.TransactionType
	if err := json.NewDecoder(r.Body).Decode(&tt); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	changedBy := "admin" // TODO: Get from auth context
	if err := h.service.CreateTransactionType(r.Context(), &tt, changedBy); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(&tt)
}

func (h *AdminHandler) getTransactionType(w http.ResponseWriter, r *http.Request, id int) {
	tt, err := h.service.GetTransactionType(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tt == nil {
		http.Error(w, "Transaction type not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(tt)
}

func (h *AdminHandler) updateTransactionType(w http.ResponseWriter, r *http.Request, id int) {
	var tt models.TransactionType
	if err := json.NewDecoder(r.Body).Decode(&tt); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	tt.ID = id
	changedBy := "admin" // TODO: Get from auth context
	if err := h.service.UpdateTransactionType(r.Context(), &tt, changedBy); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(&tt)
}

func (h *AdminHandler) deleteTransactionType(w http.ResponseWriter, r *http.Request, id int) {
	changedBy := "admin" // TODO: Get from auth context
	if err := h.service.DeleteTransactionType(r.Context(), id, changedBy); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Accounts handlers
func (h *AdminHandler) HandleAccounts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listAccounts(w, r)
	case "POST":
		h.createAccount(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) HandleAccount(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/accounts/")
	idStr := strings.Split(path, "/")[0]

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid account ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		h.getAccount(w, r, id)
	case "PUT":
		h.updateAccount(w, r, id)
	case "DELETE":
		h.deleteAccount(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) listAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := h.service.ListAccounts(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(accounts)
}

func (h *AdminHandler) createAccount(w http.ResponseWriter, r *http.Request) {
	var account models.Account
	if err := json.NewDecoder(r.Body).Decode(&account); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateAccount(r.Context(), &account); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(&account)
}

func (h *AdminHandler) getAccount(w http.ResponseWriter, r *http.Request, id int) {
	account, err := h.service.GetAccount(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if account == nil {
		http.Error(w, "Account not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(account)
}

func (h *AdminHandler) updateAccount(w http.ResponseWriter, r *http.Request, id int) {
	var account models.Account
	if err := json.NewDecoder(r.Body).Decode(&account); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	account.ID = id
	if err := h.service.UpdateAccount(r.Context(), &account); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(&account)
}

func (h *AdminHandler) deleteAccount(w http.ResponseWriter, r *http.Request, id int) {
	if err := h.service.DeleteAccount(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Account deleted successfully"})
}

// Assets handlers
func (h *AdminHandler) HandleAssets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listAssets(w, r)
	case "POST":
		h.createAsset(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) HandleAsset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/assets/")
	idStr := strings.Split(path, "/")[0]

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid asset ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		h.getAsset(w, r, id)
	case "PUT":
		h.updateAsset(w, r, id)
	case "DELETE":
		h.deleteAsset(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) listAssets(w http.ResponseWriter, r *http.Request) {
	assets, err := h.service.ListAssets(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(assets)
}

func (h *AdminHandler) createAsset(w http.ResponseWriter, r *http.Request) {
	var asset models.Asset
	if err := json.NewDecoder(r.Body).Decode(&asset); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateAsset(r.Context(), &asset); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(&asset)
}

func (h *AdminHandler) getAsset(w http.ResponseWriter, r *http.Request, id int) {
	asset, err := h.service.GetAsset(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if asset == nil {
		http.Error(w, "Asset not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(asset)
}

func (h *AdminHandler) updateAsset(w http.ResponseWriter, r *http.Request, id int) {
	var asset models.Asset
	if err := json.NewDecoder(r.Body).Decode(&asset); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	asset.ID = id
	if err := h.service.UpdateAsset(r.Context(), &asset); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(&asset)
}

func (h *AdminHandler) deleteAsset(w http.ResponseWriter, r *http.Request, id int) {
	if err := h.service.DeleteAsset(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Asset deleted successfully"})
}

// Tags handlers
func (h *AdminHandler) HandleTags(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listTags(w, r)
	case "POST":
		h.createTag(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) HandleTag(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/tags/")
	idStr := strings.Split(path, "/")[0]

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid tag ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		h.getTag(w, r, id)
	case "PUT":
		h.updateTag(w, r, id)
	case "DELETE":
		h.deleteTag(w, r, id)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *AdminHandler) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.service.ListTags(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(tags)
}

func (h *AdminHandler) createTag(w http.ResponseWriter, r *http.Request) {
	var tag models.Tag
	if err := json.NewDecoder(r.Body).Decode(&tag); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.service.CreateTag(r.Context(), &tag); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(&tag)
}

func (h *AdminHandler) getTag(w http.ResponseWriter, r *http.Request, id int) {
	tag, err := h.service.GetTag(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag == nil {
		http.Error(w, "Tag not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(tag)
}

func (h *AdminHandler) updateTag(w http.ResponseWriter, r *http.Request, id int) {
	var tag models.Tag
	if err := json.NewDecoder(r.Body).Decode(&tag); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	tag.ID = id
	if err := h.service.UpdateTag(r.Context(), &tag); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(&tag)
}

func (h *AdminHandler) deleteTag(w http.ResponseWriter, r *http.Request, id int) {
	if err := h.service.DeleteTag(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Tag deleted successfully"})
}

// Crypto: Create token (asset) and optional price mapping
func (h *AdminHandler) HandleCryptoTokens(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Expected payload: {
	//   asset: { symbol, name, decimals, is_active },
	//   mapping: { provider, provider_id, quote_currency, is_popular }
	// }
	var payload struct {
		Asset   models.Asset              `json:"asset"`
		Mapping *models.AssetPriceMapping `json:"mapping"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Create asset first
	if err := h.service.CreateAsset(r.Context(), &payload.Asset); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Optionally create mapping
	var mapping *models.AssetPriceMapping
	if payload.Mapping != nil {
		payload.Mapping.AssetID = payload.Asset.ID
		if err := h.service.CreateAssetPriceMapping(r.Context(), payload.Mapping); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		mapping = payload.Mapping
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"asset":   &payload.Asset,
		"mapping": mapping,
	})
}

// Maintenance: Recalculate FX for existing transactions
func (h *AdminHandler) HandleMaintenance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.txService == nil {
		http.Error(w, "maintenance not configured", http.StatusInternalServerError)
		return
	}

	// optional query param only_missing=true|false
	onlyMissing := true
	q := r.URL.Query().Get("only_missing")
	if q == "false" {
		onlyMissing = false
	}
	updated, err := h.txService.RecalculateFX(r.Context(), onlyMissing)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": updated, "only_missing": onlyMissing})
}

// Backup transactions (export)
func (h *AdminHandler) HandleBackupTransactions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.txService == nil {
		http.Error(w, "not configured", http.StatusInternalServerError)
		return
	}
	txs, err := h.txService.ExportTransactions(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(txs)
}

// Restore transactions (import)
func (h *AdminHandler) HandleRestoreTransactions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.txService == nil {
		http.Error(w, "not configured", http.StatusInternalServerError)
		return
	}
	// optional query: upsert=true|false
	upsert := true
	if q := r.URL.Query().Get("upsert"); q == "false" {
		upsert = false
	}
	var txs []*models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&txs); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	n, err := h.txService.ImportTransactions(r.Context(), txs, upsert)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"imported": n, "upsert": upsert})
}
