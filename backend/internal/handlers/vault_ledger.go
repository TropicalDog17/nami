package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
)

// VaultLedgerHandler exposes transaction-ledger based vault endpoints
// It reads derived state from vault_transactions via repositories.VaultTransactionRepository
// Endpoints (under /api/vaults/{vaultId}/...):
// - GET    holdings
// - GET    user/{userId}/holdings
// - GET    assets/{asset}/holdings?account=...
// - GET    transactions
// - GET    user/{userId}/transactions
// - POST   transactions (create a vault transaction)
//
// Notes: This handler is additive and does not replace existing VaultHandler.
// Server routing should delegate only these subpaths here.
type VaultLedgerHandler struct {
	repo repositories.VaultTransactionRepository
}

func NewVaultLedgerHandler(repo repositories.VaultTransactionRepository) *VaultLedgerHandler {
	return &VaultLedgerHandler{repo: repo}
}

// Handle routes all supported subpaths. Caller should ensure path starts with /api/vaults/
func (h *VaultLedgerHandler) Handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if !strings.HasPrefix(r.URL.Path, "/api/vaults/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/vaults/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	vaultID := parts[0]
	segment := parts[1]

	switch segment {
	case "holdings":
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.holdings(w, r, vaultID)
		return
	case "transactions":
		if r.Method == http.MethodGet {
			h.listTransactions(w, r, vaultID)
			return
		}
		if r.Method == http.MethodPost {
			h.createTransaction(w, r, vaultID)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	case "user":
		if len(parts) < 4 { // /api/vaults/{id}/user/{userId}/(holdings|transactions)
			http.NotFound(w, r)
			return
		}
		userID := parts[2]
		resource := parts[3]
		if resource == "holdings" && r.Method == http.MethodGet {
			h.userHoldings(w, r, vaultID, userID)
			return
		}
		if resource == "transactions" && r.Method == http.MethodGet {
			h.userTransactions(w, r, vaultID, userID)
			return
		}
		http.NotFound(w, r)
		return
	case "assets":
		// /api/vaults/{id}/assets/{asset}/holdings?account=...
		if len(parts) < 4 || parts[3] != "holdings" || r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}
		asset := parts[2]
		account := r.URL.Query().Get("account")
		if strings.TrimSpace(account) == "" {
			http.Error(w, "query param 'account' is required", http.StatusBadRequest)
			return
		}
		h.assetHoldings(w, r, vaultID, asset, account)
		return
	default:
		http.NotFound(w, r)
		return
	}
}

// holdings returns vault-level derived state
// holdings
// @Summary Get vault holdings (derived)
// @Description Get derived vault holdings from transaction ledger
// @Tags vaults
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/holdings [get]
func (h *VaultLedgerHandler) holdings(w http.ResponseWriter, r *http.Request, vaultID string) {
	res, err := h.repo.GetVaultHoldings(r.Context(), vaultID)
	if err != nil {
		http.Error(w, "Failed to get holdings: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Map to response schema from docs
	resp := map[string]any{
		"vault_id":            vaultID,
		"total_shares":        res.TotalShares,
		"total_aum":           res.TotalAUM,
		"share_price":         res.SharePrice,
		"transaction_count":   res.TransactionCount,
		"last_transaction_at": res.LastTransactionTime,
	}
	json.NewEncoder(w).Encode(resp)
}

// userHoldings
// @Summary Get user holdings (derived)
// @Description Get derived user holdings in a vault from transaction ledger
// @Tags vaults
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Param userId path string true "User ID"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/user/{userId}/holdings [get]
func (h *VaultLedgerHandler) userHoldings(w http.ResponseWriter, r *http.Request, vaultID, userID string) {
	res, err := h.repo.GetUserVaultHoldings(r.Context(), vaultID, userID)
	if err != nil {
		http.Error(w, "Failed to get user holdings: "+err.Error(), http.StatusInternalServerError)
		return
	}
	resp := map[string]any{
		"vault_id":           vaultID,
		"user_id":            userID,
		"share_balance":      res.ShareBalance,
		"net_deposits":       res.NetDeposits,
		"total_fees_paid":    res.TotalFeesPaid,
		"transaction_count":  res.TransactionCount,
		"last_activity_date": res.LastActivityDate,
	}
	json.NewEncoder(w).Encode(resp)
}

// assetHoldings
// @Summary Get asset holdings in a vault (derived)
// @Description Get derived holdings for a specific asset/account within a vault
// @Tags vaults
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Param asset path string true "Asset symbol"
// @Param account query string true "Account name"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/assets/{asset}/holdings [get]
func (h *VaultLedgerHandler) assetHoldings(w http.ResponseWriter, r *http.Request, vaultID, asset, account string) {
	res, err := h.repo.GetVaultAssetHoldings(r.Context(), vaultID, asset, account)
	if err != nil {
		http.Error(w, "Failed to get asset holdings: "+err.Error(), http.StatusInternalServerError)
		return
	}
	resp := map[string]any{
		"vault_id":            vaultID,
		"asset":               asset,
		"account":             account,
		"total_quantity":      res.TotalQuantity,
		"total_value":         res.TotalValue,
		"transaction_count":   res.TransactionCount,
		"last_transaction_at": res.LastTransactionTime,
	}
	json.NewEncoder(w).Encode(resp)
}

// listTransactions
// @Summary List vault transactions
// @Description List transactions for a vault (supports limit, offset, type, status)
// @Tags vaults
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Param limit query int false "Limit"
// @Param offset query int false "Offset"
// @Param type query string false "Transaction type"
// @Param status query string false "Status"
// @Success 200 {array} models.VaultTransaction
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/transactions [get]
func (h *VaultLedgerHandler) listTransactions(w http.ResponseWriter, r *http.Request, vaultID string) {
	// Parse query params
	q := r.URL.Query()
	limit := 100
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	var txType *models.VaultTransactionType
	if v := strings.TrimSpace(q.Get("type")); v != "" {
		vv := models.VaultTransactionType(v)
		txType = &vv
	}
	var status *string
	if v := strings.TrimSpace(q.Get("status")); v != "" {
		status = &v
	}

	filter := &models.VaultTransactionFilter{VaultID: &vaultID, Limit: limit, Offset: offset, Type: txType, Status: status}
	list, err := h.repo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, "Failed to list transactions: "+err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(list)
}

// userTransactions
// @Summary List user transactions in a vault
// @Description List transactions for a user in a vault (supports limit, offset)
// @Tags vaults
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Param userId path string true "User ID"
// @Param limit query int false "Limit"
// @Param offset query int false "Offset"
// @Success 200 {array} models.VaultTransaction
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/user/{userId}/transactions [get]
func (h *VaultLedgerHandler) userTransactions(w http.ResponseWriter, r *http.Request, vaultID, userID string) {
	q := r.URL.Query()
	limit := 50
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	list, err := h.repo.GetUserTransactionHistory(r.Context(), vaultID, userID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to list user transactions: "+err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(list)
}

// createTransaction
// @Summary Create a vault transaction
// @Description Create a new transaction recorded in the vault ledger
// @Tags vaults
// @Accept json
// @Produce json
// @Param vaultId path string true "Vault ID"
// @Param payload body models.VaultTransaction true "Vault transaction payload"
// @Success 201 {object} models.VaultTransaction
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{vaultId}/transactions [post]
func (h *VaultLedgerHandler) createTransaction(w http.ResponseWriter, r *http.Request, vaultID string) {
	var body struct {
		UserID        *string                     `json:"user_id"`
		Type          models.VaultTransactionType `json:"type"`
		AmountUSD     json.RawMessage             `json:"amount_usd"`
		Shares        json.RawMessage             `json:"shares"`
		PricePerShare json.RawMessage             `json:"price_per_share"`
		Asset         *string                     `json:"asset"`
		Account       *string                     `json:"account"`
		AssetQuantity json.RawMessage             `json:"asset_quantity"`
		AssetPrice    json.RawMessage             `json:"asset_price"`
		Notes         *string                     `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	vt := &models.VaultTransaction{
		VaultID:   vaultID,
		UserID:    body.UserID,
		Type:      body.Type,
		CreatedBy: "system", // TODO: replace with auth subject
		Timestamp: time.Now().UTC(),
	}
	// Parse decimals accepting string or number
	if d, ok := parseDecimalRaw(body.AmountUSD); ok {
		vt.AmountUSD = d
	}
	if d, ok := parseDecimalRaw(body.Shares); ok {
		vt.Shares = d
	}
	if d, ok := parseDecimalRaw(body.PricePerShare); ok {
		vt.PricePerShare = d
	}
	if body.Asset != nil {
		vt.Asset = body.Asset
	}
	if body.Account != nil {
		vt.Account = body.Account
	}
	if d, ok := parseDecimalRaw(body.AssetQuantity); ok {
		vt.AssetQuantity = d
	}
	if d, ok := parseDecimalRaw(body.AssetPrice); ok {
		vt.AssetPrice = d
	}
	vt.Notes = body.Notes

	if err := vt.Validate(); err != nil {
		http.Error(w, "validation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.repo.Create(r.Context(), vt); err != nil {
		http.Error(w, "Failed to create transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(vt)
}

// parseDecimal accepts either a plain number string or a JSON number encoded as string (RawMessage)
func parseDecimalRaw(raw json.RawMessage) (decimal.Decimal, bool) {
	if len(raw) == 0 {
		return decimal.Zero, false
	}
	// Try as string
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if d, err2 := decimal.NewFromString(strings.TrimSpace(s)); err2 == nil {
			return d, true
		}
	}
	// Try as number
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return decimal.NewFromFloat(f), true
	}
	return decimal.Zero, false
}
