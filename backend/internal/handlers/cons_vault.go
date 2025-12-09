package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// ConsolidatedVaultHandler exposes endpoints backed by VaultServicesConsolidated
// Routes under /api/cons-vaults
// - GET    /api/cons-vaults                         -> list vaults
// - POST   /api/cons-vaults                         -> create vault
// - GET    /api/cons-vaults/{id}                    -> get vault
// - DELETE /api/cons-vaults/{id}                    -> delete vault
// - GET    /api/cons-vaults/{id}/transactions       -> list transactions
// - POST   /api/cons-vaults/{id}/transactions       -> create transaction
// - POST   /api/cons-vaults/{id}/deposit            -> process deposit (composite)
// - POST   /api/cons-vaults/{id}/withdraw           -> process withdrawal (composite)
// - POST   /api/cons-vaults/{id}/update-price       -> manual pricing: update price
// - POST   /api/cons-vaults/{id}/update-total-value -> manual pricing: update total value
// - POST   /api/cons-vaults/{id}/enable-manual-pricing  -> enable manual pricing
// - POST   /api/cons-vaults/{id}/disable-manual-pricing -> disable manual pricing
// - POST   /api/cons-vaults/{id}/close              -> close vault (set status=closed)
// - POST   /api/_smoke/consolidated                 -> smoke test of consolidated flow

type ConsolidatedVaultHandler struct {
	svc services.VaultServicesConsolidated
}

func NewConsolidatedVaultHandler(svc services.VaultServicesConsolidated) *ConsolidatedVaultHandler {
	return &ConsolidatedVaultHandler{svc: svc}
}

func (h *ConsolidatedVaultHandler) HandleVaults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		vaults, err := h.svc.ListVaults(r.Context(), nil)
		if err != nil {
			http.Error(w, "failed to list vaults: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(vaults)
		return
	case http.MethodPost:
		var body struct {
			Name                string `json:"name"`
			Description         string `json:"description"`
			Type                string `json:"type"`
			Status              string `json:"status"`
			TokenSymbol         string `json:"token_symbol"`
			TokenDecimals       int    `json:"token_decimals"`
			InitialSharePrice   string `json:"initial_share_price"`
			MinDepositAmount    string `json:"min_deposit_amount"`
			IsDepositAllowed    bool   `json:"is_deposit_allowed"`
			IsWithdrawalAllowed bool   `json:"is_withdrawal_allowed"`
			CreatedBy           string `json:"created_by"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if body.Name == "" || body.Type == "" || body.Status == "" || body.TokenSymbol == "" || body.TokenDecimals == 0 {
			http.Error(w, "missing required fields", http.StatusBadRequest)
			return
		}
		initPrice := decimal.NewFromInt(1)
		if body.InitialSharePrice != "" {
			if v, err := decimal.NewFromString(body.InitialSharePrice); err == nil {
				initPrice = v
			}
		}
		minDeposit := decimal.Zero
		if body.MinDepositAmount != "" {
			if v, err := decimal.NewFromString(body.MinDepositAmount); err == nil {
				minDeposit = v
			}
		}
		var descPtr *string
		if body.Description != "" {
			d := body.Description
			descPtr = &d
		}
		vault := &models.Vault{
			Name:                body.Name,
			Description:         descPtr,
			Type:                models.VaultType(body.Type),
			Status:              models.VaultStatus(body.Status),
			TokenSymbol:         body.TokenSymbol,
			TokenDecimals:       body.TokenDecimals,
			InitialSharePrice:   initPrice,
			MinDepositAmount:    minDeposit,
			IsDepositAllowed:    body.IsDepositAllowed,
			IsWithdrawalAllowed: body.IsWithdrawalAllowed,
			InceptionDate:       time.Now().UTC(),
			LastUpdated:         time.Now().UTC(),
			CreatedBy:           coalesce(body.CreatedBy, "system"),
		}
		created, err := h.svc.CreateVault(r.Context(), vault)
		if err != nil {
			http.Error(w, "failed to create vault: "+err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (h *ConsolidatedVaultHandler) HandleVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !strings.HasPrefix(r.URL.Path, "/api/cons-vaults/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/cons-vaults/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	if id == "_smoke" {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.hSmoke(w, r)
		return
	}
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch r.Method {
	case http.MethodGet:
		if action == "" {
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		if action == "transactions" {
			list, err := h.svc.GetVaultTransactions(r.Context(), id)
			if err != nil {
				http.Error(w, "failed to get transactions: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(list)
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
		return
	case http.MethodDelete:
		if action != "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err := h.svc.DeleteVault(r.Context(), id); err != nil {
			http.Error(w, "failed to delete vault: "+err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	case http.MethodPost:
		if action == "transactions" {
			var body struct {
				UserID        *string `json:"user_id"`
				Type          string  `json:"type"`
				Status        string  `json:"status"`
				AmountUSD     string  `json:"amount_usd"`
				Shares        string  `json:"shares"`
				PricePerShare string  `json:"price_per_share"`
				Asset         *string `json:"asset"`
				Account       *string `json:"account"`
				AssetQuantity string  `json:"asset_quantity"`
				AssetPrice    string  `json:"asset_price"`
				FeeAmount     string  `json:"fee_amount"`
				FeeType       *string `json:"fee_type"`
				FeeRate       string  `json:"fee_rate"`
				CreatedBy     string  `json:"created_by"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			amount := decimal.Zero
			shares := decimal.Zero
			pps := decimal.Zero
			qty := decimal.Zero
			ap := decimal.Zero
			feeAmt := decimal.Zero
			feeRate := decimal.Zero
			if body.AmountUSD != "" {
				amount, _ = decimal.NewFromString(body.AmountUSD)
			}
			if body.Shares != "" {
				shares, _ = decimal.NewFromString(body.Shares)
			}
			if body.PricePerShare != "" {
				pps, _ = decimal.NewFromString(body.PricePerShare)
			}
			if body.AssetQuantity != "" {
				qty, _ = decimal.NewFromString(body.AssetQuantity)
			}
			if body.AssetPrice != "" {
				ap, _ = decimal.NewFromString(body.AssetPrice)
			}
			if body.FeeAmount != "" {
				feeAmt, _ = decimal.NewFromString(body.FeeAmount)
			}
			if body.FeeRate != "" {
				feeRate, _ = decimal.NewFromString(body.FeeRate)
			}
			tx := &models.VaultTransaction{
				VaultID:       id,
				UserID:        body.UserID,
				Type:          models.VaultTransactionType(body.Type),
				Status:        coalesce(body.Status, "executed"),
				AmountUSD:     amount,
				Shares:        shares,
				PricePerShare: pps,
				Asset:         body.Asset,
				Account:       body.Account,
				AssetQuantity: qty,
				AssetPrice:    ap,
				FeeAmount:     feeAmt,
				FeeType:       body.FeeType,
				FeeRate:       feeRate,
				CreatedBy:     coalesce(body.CreatedBy, "system"),
				Timestamp:     time.Now().UTC(),
			}
			created, err := h.svc.CreateTransaction(r.Context(), tx)
			if err != nil {
				http.Error(w, "failed to create transaction: "+err.Error(), http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(created)
			return
		}
		if action == "deposit" || action == "withdraw" {
			var body struct {
				Amount   float64  `json:"amount"`
				Asset    *string  `json:"asset"`
				Quantity *float64 `json:"quantity"`
				Price    *float64 `json:"price"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			if body.Amount <= 0 {
				http.Error(w, "amount must be > 0", http.StatusBadRequest)
				return
			}
			asset := "USDT"
			if body.Asset != nil && *body.Asset != "" {
				asset = *body.Asset
			}
			qty := body.Amount
			if body.Quantity != nil {
				qty = *body.Quantity
			}
			price := 1.0
			if body.Price != nil {
				price = *body.Price
			}
			dAmt := decimal.NewFromFloat(body.Amount)
			dQty := decimal.NewFromFloat(qty)
			dPrice := decimal.NewFromFloat(price)
			var err error
			if action == "deposit" {
				_, _, err = h.svc.ProcessDeposit(r.Context(), id, "cons-api-user", dAmt, asset, dQty, dPrice)
			} else {
				_, _, err = h.svc.ProcessWithdrawal(r.Context(), id, "cons-api-user", dAmt, asset, dQty, dPrice)
			}
			if err != nil {
				http.Error(w, action+" failed: "+err.Error(), http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
			return
		}
		// Manual pricing endpoints
		if action == "update-price" {
			var body struct {
				NewPrice float64 `json:"new_price"`
				Notes    *string `json:"notes"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			if body.NewPrice <= 0 {
				http.Error(w, "new_price must be > 0", http.StatusBadRequest)
				return
			}
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			price := decimal.NewFromFloat(body.NewPrice)
			if err := v.UpdateManualPrice(price, "user", body.Notes); err != nil {
				http.Error(w, "invalid manual price: "+err.Error(), http.StatusBadRequest)
				return
			}
			if err := h.svc.UpdateVault(r.Context(), v); err != nil {
				http.Error(w, "failed to save vault: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		if action == "update-total-value" {
			var body struct {
				TotalValue           float64  `json:"total_value"`
				NetContributionDelta *float64 `json:"net_contribution_delta"`
				Notes                *string  `json:"notes"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			if body.TotalValue <= 0 {
				http.Error(w, "total_value must be > 0", http.StatusBadRequest)
				return
			}
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			tv := decimal.NewFromFloat(body.TotalValue)
			nd := decimal.Zero
			if body.NetContributionDelta != nil {
				nd = decimal.NewFromFloat(*body.NetContributionDelta)
			}
			if err := v.UpdateManualTotalValue(tv, nd, "user", body.Notes); err != nil {
				http.Error(w, "invalid manual total value: "+err.Error(), http.StatusBadRequest)
				return
			}
			if err := h.svc.UpdateVault(r.Context(), v); err != nil {
				http.Error(w, "failed to save vault: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		if action == "enable-manual-pricing" {
			var body struct {
				InitialPrice float64 `json:"initial_price"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			if body.InitialPrice <= 0 {
				http.Error(w, "initial_price must be > 0", http.StatusBadRequest)
				return
			}
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			if err := v.EnableManualPricing(decimal.NewFromFloat(body.InitialPrice), "user"); err != nil {
				http.Error(w, "invalid manual pricing: "+err.Error(), http.StatusBadRequest)
				return
			}
			if err := h.svc.UpdateVault(r.Context(), v); err != nil {
				http.Error(w, "failed to save vault: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		if action == "disable-manual-pricing" {
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			v.DisableManualPricing()
			if err := h.svc.UpdateVault(r.Context(), v); err != nil {
				http.Error(w, "failed to save vault: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		if action == "close" {
			v, err := h.svc.GetVault(r.Context(), id)
			if err != nil {
				http.Error(w, "vault not found: "+err.Error(), http.StatusNotFound)
				return
			}
			v.Status = models.VaultStatusClosed
			v.LastUpdated = time.Now().UTC()
			if err := h.svc.UpdateVault(r.Context(), v); err != nil {
				http.Error(w, "failed to close vault: "+err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(v)
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// HandleSmoke exposes POST /api/_smoke/consolidated to exercise the consolidated service for CI
func (h *ConsolidatedVaultHandler) HandleSmoke(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.hSmoke(w, r)
}

// hSmoke exercises the consolidated service end-to-end for CI
func (h *ConsolidatedVaultHandler) hSmoke(w http.ResponseWriter, r *http.Request) {
	name := "cons-smoke-" + time.Now().UTC().Format("20060102-150405")
	vault := &models.Vault{
		Name:                name,
		Type:                "single_asset",
		Status:              "active",
		TokenSymbol:         "SMOKE",
		TokenDecimals:       18,
		InitialSharePrice:   decimal.NewFromInt(1),
		MinDepositAmount:    decimal.NewFromInt(1),
		IsDepositAllowed:    true,
		IsWithdrawalAllowed: true,
		InceptionDate:       time.Now().UTC(),
		LastUpdated:         time.Now().UTC(),
		CreatedBy:           "ci",
	}
	created, err := h.svc.CreateVault(r.Context(), vault)
	if err != nil {
		http.Error(w, "create vault failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Deposit $1000 in USDT at 1
	_, _, err = h.svc.ProcessDeposit(r.Context(), created.ID, "smoke-user", decimal.NewFromInt(1000), "USDT", decimal.NewFromInt(1000), decimal.NewFromInt(1))
	if err != nil {
		http.Error(w, "deposit failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Yield $10
	_, err = h.svc.ProcessYield(r.Context(), created.ID, decimal.NewFromInt(10), "USDT", decimal.NewFromInt(10), decimal.NewFromInt(1))
	if err != nil {
		http.Error(w, "yield failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Fee $5
	_, err = h.svc.ProcessFee(r.Context(), created.ID, decimal.NewFromInt(5), "management", decimal.NewFromFloat(0))
	if err != nil {
		http.Error(w, "fee failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Recalc
	if err := h.svc.RecalculateVaultState(r.Context(), created.ID); err != nil {
		http.Error(w, "recalc failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	summary, err := h.svc.GetVaultSummary(r.Context(), created.ID)
	if err != nil {
		http.Error(w, "summary failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]any{
		"status":   "ok",
		"vault_id": created.ID,
		"summary":  summary,
	})
}

func coalesce[T ~string](v T, def T) T {
	if string(v) == "" {
		return def
	}
	return v
}
