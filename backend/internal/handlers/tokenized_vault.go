package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// TokenizedVaultHandler handles operations for tokenized vaults
type TokenizedVaultHandler struct {
	vaultService       services.VaultService
	vaultShareService  services.VaultShareService
	vaultAssetService  services.VaultAssetService
	transactionService services.VaultTransactionService
	priceService       services.AssetPriceService
}

func NewTokenizedVaultHandler(
	vaultService services.VaultService,
	vaultShareService services.VaultShareService,
	vaultAssetService services.VaultAssetService,
	transactionService services.VaultTransactionService,
	priceService services.AssetPriceService,
) *TokenizedVaultHandler {
	return &TokenizedVaultHandler{
		vaultService:       vaultService,
		vaultShareService:  vaultShareService,
		vaultAssetService:  vaultAssetService,
		transactionService: transactionService,
		priceService:       priceService,
	}
}

// tokenizedVaultDTO represents the response structure for tokenized vaults
type tokenizedVaultDTO struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description *string            `json:"description,omitempty"`
	Type        models.VaultType   `json:"type"`
	Status      models.VaultStatus `json:"status"`

	// Token information
	TokenSymbol   string          `json:"token_symbol"`
	TokenDecimals int             `json:"token_decimals"`
	TotalSupply   decimal.Decimal `json:"total_supply"`

	// Financial metrics
	TotalAssetsUnderManagement decimal.Decimal `json:"total_assets_under_management"`
	CurrentSharePrice          decimal.Decimal `json:"current_share_price"`
	InitialSharePrice          decimal.Decimal `json:"initial_share_price"`
	HighWatermark              decimal.Decimal `json:"high_watermark"`

	// User-defined pricing
	IsUserDefinedPrice          bool            `json:"is_user_defined_price"`
	ManualPricePerShare         decimal.Decimal `json:"manual_price_per_share"`
	ManualPricingInitialAUM     decimal.Decimal `json:"manual_pricing_initial_aum"`
	ManualPricingReferencePrice decimal.Decimal `json:"manual_pricing_reference_price"`
	PriceLastUpdatedBy          *string         `json:"price_last_updated_by,omitempty"`
	PriceLastUpdatedAt          *time.Time      `json:"price_last_updated_at,omitempty"`
	PriceUpdateNotes            *string         `json:"price_update_notes,omitempty"`

	// Configuration
	MinDepositAmount    decimal.Decimal  `json:"min_deposit_amount"`
	MaxDepositAmount    *decimal.Decimal `json:"max_deposit_amount,omitempty"`
	MinWithdrawalAmount decimal.Decimal  `json:"min_withdrawal_amount"`
	IsDepositAllowed    bool             `json:"is_deposit_allowed"`
	IsWithdrawalAllowed bool             `json:"is_withdrawal_allowed"`

	// Performance tracking
	InceptionDate             time.Time       `json:"inception_date"`
	LastUpdated               time.Time       `json:"last_updated"`
	PerformanceSinceInception decimal.Decimal `json:"performance_since_inception"`

	// Live metrics (optional, computed at request time)
	AsOf                *time.Time       `json:"as_of,omitempty"`
	CurrentPriceUSD     *decimal.Decimal `json:"current_price_usd,omitempty"`
	ROIRealTimePercent  *decimal.Decimal `json:"roi_realtime_percent,omitempty"`
	BenchmarkAsset      *string          `json:"benchmark_asset,omitempty"`
	BenchmarkROIPercent *decimal.Decimal `json:"benchmark_roi_percent,omitempty"`

	// Asset breakdown
	AssetBreakdown []assetBreakdownDTO `json:"asset_breakdown,omitempty"`

	// Audit
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// assetBreakdownDTO represents the breakdown of assets within a vault
type assetBreakdownDTO struct {
	Asset                string          `json:"asset"`
	Quantity             decimal.Decimal `json:"quantity"`
	CurrentMarketValue   decimal.Decimal `json:"current_market_value"`
	AllocationPercent    decimal.Decimal `json:"allocation_percent"`
	UnrealizedPnL        decimal.Decimal `json:"unrealized_pnl"`
	UnrealizedPnLPercent decimal.Decimal `json:"unrealized_pnl_percent"`
}

// HandleTokenizedVaults handles GET /api/tokenized-vaults and POST /api/tokenized-vaults
func (h *TokenizedVaultHandler) HandleTokenizedVaults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		h.listTokenizedVaults(w, r)
		return
	case http.MethodPost:
		h.createTokenizedVault(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// HandleTokenizedVault handles routes under /api/tokenized-vaults/{id}/...
func (h *TokenizedVaultHandler) HandleTokenizedVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if !strings.HasPrefix(r.URL.Path, "/api/tokenized-vaults/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/tokenized-vaults/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch r.Method {
	case http.MethodGet:
		if action != "" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.getTokenizedVault(w, r, id)
		return
	case http.MethodPost:
		switch action {
		case "deposit":
			h.handleDeposit(w, r, id)
			return
		case "withdraw":
			h.handleWithdraw(w, r, id)
			return
		case "update-price":
			h.handleUpdatePrice(w, r, id)
			return
		case "update-total-value":
			h.handleUpdateTotalValue(w, r, id)
			return
		case "enable-manual-pricing":
			h.handleEnableManualPricing(w, r, id)
			return
		case "disable-manual-pricing":
			h.handleDisableManualPricing(w, r, id)
			return
		case "close":
			h.handleClose(w, r, id)
			return
		default:
			http.Error(w, "Unknown action", http.StatusNotFound)
			return
		}
	case http.MethodPut:
		if action != "" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.updateTokenizedVault(w, r, id)
		return
	case http.MethodDelete:
		if action != "" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.deleteTokenizedVault(w, r, id)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (h *TokenizedVaultHandler) listTokenizedVaults(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	filter := &models.VaultFilter{}
	if t := r.URL.Query().Get("type"); t != "" {
		vaultType := models.VaultType(t)
		filter.Type = &vaultType
	}
	if s := r.URL.Query().Get("status"); s != "" {
		status := models.VaultStatus(s)
		filter.Status = &status
	}
	if cb := r.URL.Query().Get("created_by"); cb != "" {
		filter.CreatedBy = &cb
	}
	if lda := r.URL.Query().Get("is_deposit_allowed"); lda != "" {
		if b, err := strconv.ParseBool(lda); err == nil {
			filter.IsDepositAllowed = &b
		}
	}

	vaults, err := h.vaultService.GetVaults(r.Context(), filter)
	if err != nil {
		http.Error(w, "Failed to list vaults: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert to DTOs
	result := make([]*tokenizedVaultDTO, 0, len(vaults))
	for _, vault := range vaults {
		dto := h.mapVaultToDTO(vault)
		// Optionally enrich with live data
		if r.URL.Query().Get("enrich") == "true" {
			h.enrichVaultWithLiveMetrics(r, vault, dto)
		}
		result = append(result, dto)
	}

	json.NewEncoder(w).Encode(result)
}

func (h *TokenizedVaultHandler) createTokenizedVault(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name                string           `json:"name" validate:"required"`
		Description         *string          `json:"description,omitempty"`
		Type                models.VaultType `json:"type" validate:"required"`
		TokenSymbol         string           `json:"token_symbol" validate:"required"`
		TokenDecimals       int              `json:"token_decimals"`
		InitialSharePrice   decimal.Decimal  `json:"initial_share_price"`
		ManagementFeeRate   decimal.Decimal  `json:"management_fee_rate"`
		PerformanceFeeRate  decimal.Decimal  `json:"performance_fee_rate"`
		DepositFeeRate      decimal.Decimal  `json:"deposit_fee_rate"`
		WithdrawalFeeRate   decimal.Decimal  `json:"withdrawal_fee_rate"`
		MinDepositAmount    decimal.Decimal  `json:"min_deposit_amount"`
		MaxDepositAmount    *decimal.Decimal `json:"max_deposit_amount,omitempty"`
		MinWithdrawalAmount decimal.Decimal  `json:"min_withdrawal_amount"`
		IsDepositAllowed    bool             `json:"is_deposit_allowed"`
		IsWithdrawalAllowed bool             `json:"is_withdrawal_allowed"`
		EnableManualPricing bool             `json:"enable_manual_pricing"`
		InitialManualPrice  decimal.Decimal  `json:"initial_manual_price"`
		InitialTotalValue   decimal.Decimal  `json:"initial_total_value"`
		DescriptionText     string           `json:"description_text,omitempty"`
		Notes               string           `json:"notes,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Set defaults
	if body.TokenDecimals == 0 {
		body.TokenDecimals = 18
	}
	if body.InitialSharePrice.IsZero() {
		body.InitialSharePrice = decimal.NewFromInt(1)
	}

	// Create vault
	vault := &models.Vault{
		Name:                       body.Name,
		Description:                body.Description,
		Type:                       body.Type,
		Status:                     models.VaultStatusActive,
		TokenSymbol:                body.TokenSymbol,
		TokenDecimals:              body.TokenDecimals,
		TotalAssetsUnderManagement: decimal.Zero,
		CurrentSharePrice:          body.InitialSharePrice,
		InitialSharePrice:          body.InitialSharePrice,
		HighWatermark:              body.InitialSharePrice, // Initialize to initial share price
		MinDepositAmount:           body.MinDepositAmount,
		MaxDepositAmount:           body.MaxDepositAmount,
		MinWithdrawalAmount:        body.MinWithdrawalAmount,
		IsDepositAllowed:           body.IsDepositAllowed,
		IsWithdrawalAllowed:        body.IsWithdrawalAllowed,
		InceptionDate:              time.Now(),
		LastUpdated:                time.Now(),
		CreatedBy:                  "user", // TODO: Get from auth context
	}

	if err := vault.Validate(); err != nil {
		http.Error(w, "Invalid vault data: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Enable manual pricing if requested
	if body.EnableManualPricing && !body.InitialManualPrice.IsZero() {
		if err := vault.EnableManualPricing(body.InitialManualPrice, "user"); err != nil {
			http.Error(w, "Failed to enable manual pricing: "+err.Error(), http.StatusBadRequest)
			return
		}
	}

	// Seed initial total value (AUM) if provided
	if body.InitialTotalValue.IsPositive() {
		var notesPtr *string
		if strings.TrimSpace(body.Notes) != "" {
			n := body.Notes
			notesPtr = &n
		}
		if err := vault.UpdateManualTotalValue(body.InitialTotalValue, decimal.Zero, "user", notesPtr); err != nil {
			http.Error(w, "Failed to set initial total value: "+err.Error(), http.StatusBadRequest)
			return
		}
	}

	created, err := h.vaultService.CreateVault(r.Context(), vault)
	if err != nil {
		http.Error(w, "Failed to create vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	dto := h.mapVaultToDTO(created)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) getTokenizedVault(w http.ResponseWriter, r *http.Request, id string) {
	vault, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	dto := h.mapVaultToDTO(vault)

	// Enrich with additional data if requested
	if r.URL.Query().Get("enrich") == "true" {
		h.enrichVaultWithLiveMetrics(r, vault, dto)
		h.loadAssetBreakdown(r.Context(), vault, dto)
	}

	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleUpdatePrice(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		NewPrice decimal.Decimal `json:"new_price" validate:"required,gt=0"`
		Notes    *string         `json:"notes,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	vault, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	// Update price
	updatedBy := "user" // TODO: Get from auth context
	if err := vault.UpdateManualPrice(body.NewPrice, updatedBy, body.Notes); err != nil {
		http.Error(w, "Failed to update price: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Save vault
	if err := h.vaultService.UpdateVault(r.Context(), vault); err != nil {
		http.Error(w, "Failed to save vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Create price update transaction
	tx := &models.VaultTransaction{
		VaultID:       id,
		Type:          models.VaultTxTypeValuation,
		AmountUSD:     body.NewPrice,
		PricePerShare: body.NewPrice,
		Notes:         body.Notes,
		CreatedBy:     updatedBy,
		Timestamp:     time.Now(),
	}
	if _, err := h.transactionService.CreateTransaction(r.Context(), tx); err != nil {
		// Log error but don't fail the response
		// TODO: Add proper logging
	}

	dto := h.mapVaultToDTO(vault)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleUpdateTotalValue(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		TotalValue           decimal.Decimal `json:"total_value" validate:"required,gt=0"`
		NetContributionDelta decimal.Decimal `json:"net_contribution_delta"`
		Notes                *string         `json:"notes,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	vault, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	previousAUM := vault.TotalAssetsUnderManagement
	previousPrice := vault.CurrentSharePrice

	updatedBy := "user" // TODO: Get from auth context
	if err := vault.UpdateManualTotalValue(body.TotalValue, body.NetContributionDelta, updatedBy, body.Notes); err != nil {
		http.Error(w, "Failed to update total value: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.vaultService.UpdateVault(r.Context(), vault); err != nil {
		http.Error(w, "Failed to save vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	tx := &models.VaultTransaction{
		VaultID:          id,
		Type:             models.VaultTxTypeValuation,
		AmountUSD:        body.TotalValue,
		Shares:           vault.TotalSupply,
		PricePerShare:    vault.CurrentSharePrice,
		Notes:            body.Notes,
		CreatedBy:        updatedBy,
		Timestamp:        time.Now(),
		VaultAUMBefore:   previousAUM,
		VaultAUMAfter:    vault.TotalAssetsUnderManagement,
		SharePriceBefore: previousPrice,
		SharePriceAfter:  vault.CurrentSharePrice,
	}
	if _, err := h.transactionService.CreateTransaction(r.Context(), tx); err != nil {
		// TODO: add structured logging
	}

	dto := h.mapVaultToDTO(vault)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleEnableManualPricing(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		InitialPrice decimal.Decimal `json:"initial_price" validate:"required,gt=0"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	vault, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	updatedBy := "user" // TODO: Get from auth context
	if err := vault.EnableManualPricing(body.InitialPrice, updatedBy); err != nil {
		http.Error(w, "Failed to enable manual pricing: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.vaultService.UpdateVault(r.Context(), vault); err != nil {
		http.Error(w, "Failed to save vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	dto := h.mapVaultToDTO(vault)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleDisableManualPricing(w http.ResponseWriter, r *http.Request, id string) {
	vault, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	vault.DisableManualPricing()

	if err := h.vaultService.UpdateVault(r.Context(), vault); err != nil {
		http.Error(w, "Failed to save vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	dto := h.mapVaultToDTO(vault)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleDeposit(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		Amount decimal.Decimal `json:"amount"`
		Notes  *string         `json:"notes,omitempty"`
		// Back-compat: allow "cost" as alias
		Cost decimal.Decimal `json:"cost"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	amount := body.Amount
	if amount.IsZero() && body.Cost.IsPositive() {
		amount = body.Cost
	}
	if !amount.IsPositive() {
		http.Error(w, "amount must be positive", http.StatusBadRequest)
		return
	}

	// Verify vault exists first
	if _, err := h.vaultService.GetVaultByID(r.Context(), id); err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

	userID := "user" // TODO: pull from auth context
	if _, _, err := h.transactionService.ProcessDeposit(r.Context(), id, userID, amount); err != nil {
		http.Error(w, "Failed to process deposit: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Return updated vault state
	updated, err := h.vaultService.GetVaultByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to load updated vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	dto := h.mapVaultToDTO(updated)
	json.NewEncoder(w).Encode(dto)
}

func (h *TokenizedVaultHandler) handleWithdraw(w http.ResponseWriter, r *http.Request, id string) {
	// TODO: Implement withdrawal logic
	http.Error(w, "Not implemented yet", http.StatusNotImplemented)
}

func (h *TokenizedVaultHandler) handleClose(w http.ResponseWriter, r *http.Request, id string) {
	// TODO: Implement vault closure logic
	http.Error(w, "Not implemented yet", http.StatusNotImplemented)
}

func (h *TokenizedVaultHandler) updateTokenizedVault(w http.ResponseWriter, r *http.Request, id string) {
	// TODO: Implement vault update logic
	http.Error(w, "Not implemented yet", http.StatusNotImplemented)
}

func (h *TokenizedVaultHandler) deleteTokenizedVault(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" {
		http.Error(w, "Vault ID is required", http.StatusBadRequest)
		return
	}

	if err := h.vaultService.DeleteVault(r.Context(), id); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			http.Error(w, "Vault not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete vault: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helper methods

func (h *TokenizedVaultHandler) mapVaultToDTO(vault *models.Vault) *tokenizedVaultDTO {
	return &tokenizedVaultDTO{
		ID:                          vault.ID,
		Name:                        vault.Name,
		Description:                 vault.Description,
		Type:                        vault.Type,
		Status:                      vault.Status,
		TokenSymbol:                 vault.TokenSymbol,
		TokenDecimals:               vault.TokenDecimals,
		TotalSupply:                 vault.TotalSupply,
		TotalAssetsUnderManagement:  vault.TotalAssetsUnderManagement,
		CurrentSharePrice:           vault.CurrentSharePrice,
		InitialSharePrice:           vault.InitialSharePrice,
		IsUserDefinedPrice:          vault.IsUserDefinedPrice,
		ManualPricePerShare:         vault.ManualPricePerShare,
		ManualPricingInitialAUM:     vault.ManualPricingInitialAUM,
		ManualPricingReferencePrice: vault.ManualPricingReferencePrice,
		PriceLastUpdatedBy:          vault.PriceLastUpdatedBy,
		PriceLastUpdatedAt:          vault.PriceLastUpdatedAt,
		PriceUpdateNotes:            vault.PriceUpdateNotes,
		MinDepositAmount:            vault.MinDepositAmount,
		MaxDepositAmount:            vault.MaxDepositAmount,
		MinWithdrawalAmount:         vault.MinWithdrawalAmount,
		IsDepositAllowed:            vault.IsDepositAllowed,
		IsWithdrawalAllowed:         vault.IsWithdrawalAllowed,
		InceptionDate:               vault.InceptionDate,
		LastUpdated:                 vault.LastUpdated,
		PerformanceSinceInception:   vault.CalculatePerformanceSinceInception(),
		CreatedBy:                   vault.CreatedBy,
		CreatedAt:                   vault.CreatedAt,
		UpdatedAt:                   vault.UpdatedAt,
	}
}

func (h *TokenizedVaultHandler) enrichVaultWithLiveMetrics(r *http.Request, vault *models.Vault, dto *tokenizedVaultDTO) {
	if h.priceService == nil {
		return
	}

	// For demonstration, we can add benchmark comparisons
	// TODO: Implement live metrics enrichment based on vault assets
	now := time.Now().UTC()
	dto.AsOf = &now
}

func (h *TokenizedVaultHandler) loadAssetBreakdown(ctx context.Context, vault *models.Vault, dto *tokenizedVaultDTO) {
	// Load assets for this vault
	assetFilter := &models.VaultAssetFilter{
		VaultID: &vault.ID,
	}
	assets, err := h.vaultAssetService.GetAssets(ctx, assetFilter)
	if err != nil {
		return // Silently fail for now
	}

	breakdown := make([]assetBreakdownDTO, 0, len(assets))
	for _, asset := range assets {
		allocationPercent := decimal.Zero
		if vault.TotalAssetsUnderManagement.IsPositive() {
			allocationPercent = asset.CurrentMarketValue.Div(vault.TotalAssetsUnderManagement).Mul(decimal.NewFromInt(100))
		}

		breakdown = append(breakdown, assetBreakdownDTO{
			Asset:                asset.Asset,
			Quantity:             asset.Quantity,
			CurrentMarketValue:   asset.CurrentMarketValue,
			AllocationPercent:    allocationPercent,
			UnrealizedPnL:        asset.UnrealizedPnL,
			UnrealizedPnLPercent: asset.UnrealizedPnLPercent,
		})
	}

	dto.AssetBreakdown = breakdown
}
