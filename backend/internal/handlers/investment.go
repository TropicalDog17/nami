package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type InvestmentHandler struct {
	investmentService services.InvestmentService
}

func NewInvestmentHandler(investmentService services.InvestmentService) *InvestmentHandler {
	return &InvestmentHandler{
		investmentService: investmentService,
	}
}

// extractVaultNameFromPath extracts vault name from URL path
// Works with both gorilla/mux and manual path parsing
func extractVaultNameFromPath(r *http.Request) string {
	// Try gorilla/mux first
	if vars := mux.Vars(r); vars != nil {
		if name := vars["name"]; name != "" {
			return name
		}
	}

	// Fallback to manual path parsing
	path := strings.TrimPrefix(r.URL.Path, "/api/vaults/")
	path = strings.TrimPrefix(path, "/api/vaults") // handle both cases

	// Split by '/' to get the vault name (first part)
	if parts := strings.Split(path, "/"); len(parts) > 0 && parts[0] != "" {
		return parts[0]
	}

	return ""
}

// HandleInvestments handles GET /api/investments
// @Summary Get investments
// @Description Retrieve investments based on filter criteria
// @Tags investments
// @Accept json
// @Produce json
// @Param asset query string false "Filter by asset"
// @Param account query string false "Filter by account"
// @Param horizon query string false "Filter by horizon"
// @Param is_open query bool false "Filter by open status"
// @Param limit query int false "Limit results"
// @Param offset query int false "Offset results"
// @Success 200 {array} models.Investment
// @Failure 500 {string} string "Internal server error"
// @Router /investments [get]
func (h *InvestmentHandler) HandleInvestments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	filter := &models.InvestmentFilter{}

	if asset := r.URL.Query().Get("asset"); asset != "" {
		filter.Asset = asset
	}

	if account := r.URL.Query().Get("account"); account != "" {
		filter.Account = account
	}

	if horizon := r.URL.Query().Get("horizon"); horizon != "" {
		filter.Horizon = horizon
	}

	if isOpenStr := r.URL.Query().Get("is_open"); isOpenStr != "" {
		if isOpen, err := strconv.ParseBool(isOpenStr); err == nil {
			filter.IsOpen = &isOpen
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			filter.Limit = limit
		}
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil && offset >= 0 {
			filter.Offset = offset
		}
	}

	investments, err := h.investmentService.GetInvestments(r.Context(), filter)
	if err != nil {
		http.Error(w, "Failed to get investments: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(investments)
}

// HandleInvestmentByID handles GET /api/investments/{id}
// @Summary Get investment by ID
// @Description Retrieve a specific investment by ID
// @Tags investments
// @Accept json
// @Produce json
// @Param id path string true "Investment ID"
// @Success 200 {object} models.Investment
// @Failure 404 {string} string "Investment not found"
// @Failure 500 {string} string "Internal server error"
// @Router /investments/{id} [get]
func (h *InvestmentHandler) HandleInvestmentByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	if id == "" {
		http.Error(w, "Investment ID is required", http.StatusBadRequest)
		return
	}

	investment, err := h.investmentService.GetInvestmentByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to get investment: "+err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(investment)
}

// HandleInvestmentSummary handles GET /api/investments/summary
// @Summary Get investment summary
// @Description Retrieve investment summary statistics
// @Tags investments
// @Accept json
// @Produce json
// @Param asset query string false "Filter by asset"
// @Param account query string false "Filter by account"
// @Param horizon query string false "Filter by horizon"
// @Param is_open query bool false "Filter by open status"
// @Success 200 {object} models.InvestmentSummary
// @Failure 500 {string} string "Internal server error"
// @Router /investments/summary [get]
func (h *InvestmentHandler) HandleInvestmentSummary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	filter := &models.InvestmentFilter{}

	if asset := r.URL.Query().Get("asset"); asset != "" {
		filter.Asset = asset
	}

	if account := r.URL.Query().Get("account"); account != "" {
		filter.Account = account
	}

	if horizon := r.URL.Query().Get("horizon"); horizon != "" {
		filter.Horizon = horizon
	}

	if isOpenStr := r.URL.Query().Get("is_open"); isOpenStr != "" {
		if isOpen, err := strconv.ParseBool(isOpenStr); err == nil {
			filter.IsOpen = &isOpen
		}
	}

	summary, err := h.investmentService.GetInvestmentSummary(r.Context(), filter)
	if err != nil {
		http.Error(w, "Failed to get investment summary: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(summary)
}

// HandleStake handles POST /api/investments/stake
// @Summary Create stake investment
// @Description Process a stake transaction and create/update investment
// @Tags investments
// @Accept json
// @Produce json
// @Param stake body models.Transaction true "Stake transaction"
// @Success 201 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /investments/stake [post]
func (h *InvestmentHandler) HandleStake(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var stakeTx models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&stakeTx); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate stake transaction
	if stakeTx.Asset == "" || stakeTx.Account == "" || stakeTx.Quantity.IsZero() || stakeTx.Quantity.IsNegative() {
		http.Error(w, "Invalid stake transaction: asset, account, and positive quantity are required", http.StatusBadRequest)
		return
	}

	investment, err := h.investmentService.ProcessStake(r.Context(), &stakeTx)
	if err != nil {
		http.Error(w, "Failed to process stake: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(investment)
}

// HandleUnstake handles POST /api/investments/unstake
// @Summary Create unstake investment
// @Description Process an unstake transaction and update investment. The field `investment_id` is required and must reference an existing open investment.
// @Tags investments
// @Accept json
// @Produce json
// @Param unstake body models.Transaction true "Unstake transaction (requires investment_id)"
// @Success 201 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /investments/unstake [post]
func (h *InvestmentHandler) HandleUnstake(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var unstakeTx models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&unstakeTx); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate unstake transaction
	if unstakeTx.Asset == "" || unstakeTx.Account == "" || unstakeTx.Quantity.IsZero() || unstakeTx.Quantity.IsNegative() {
		http.Error(w, "Invalid unstake transaction: asset, account, and positive quantity are required", http.StatusBadRequest)
		return
	}
	if unstakeTx.InvestmentID == nil || *unstakeTx.InvestmentID == "" {
		http.Error(w, "Invalid unstake transaction: investment_id is required", http.StatusBadRequest)
		return
	}

	investment, err := h.investmentService.ProcessUnstake(r.Context(), &unstakeTx)
	if err != nil {
		http.Error(w, "Failed to process unstake: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(investment)
}

// HandleAvailableInvestments handles GET /api/investments/available
// @Summary Get available investments for stake
// @Description Retrieve open investments available for stake operations
// @Tags investments
// @Accept json
// @Produce json
// @Param asset query string true "Asset"
// @Param account query string true "Account"
// @Param horizon query string false "Horizon"
// @Success 200 {array} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /investments/available [get]
func (h *InvestmentHandler) HandleAvailableInvestments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	asset := r.URL.Query().Get("asset")
	account := r.URL.Query().Get("account")
	horizon := r.URL.Query().Get("horizon")

	if asset == "" || account == "" {
		http.Error(w, "asset and account query parameters are required", http.StatusBadRequest)
		return
	}

	investments, err := h.investmentService.GetOpenInvestmentsForStake(r.Context(), asset, account, horizon)
	if err != nil {
		http.Error(w, "Failed to get available investments: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(investments)
}

// Vault-specific handlers

// HandleCreateVault handles POST /api/vaults
// @Summary Create a new vault
// @Description Create a new vault with the given parameters
// @Tags vaults
// @Accept json
// @Produce json
// @Param vault body CreateVaultRequest true "Vault creation request"
// @Success 201 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults [post]
func (h *InvestmentHandler) HandleCreateVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateVaultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Name == "" || req.Asset == "" || req.Account == "" {
		http.Error(w, "name, asset, and account are required", http.StatusBadRequest)
		return
	}

	if req.InitialDeposit.IsNegative() {
		http.Error(w, "initial deposit cannot be negative", http.StatusBadRequest)
		return
	}

	vault, err := h.investmentService.CreateVault(r.Context(), req.Name, req.Asset, req.Account, req.InitialDeposit, req.Horizon)
	if err != nil {
		http.Error(w, "Failed to create vault: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(vault)
}

// HandleGetActiveVaults handles GET /api/vaults
// @Summary Get all active vaults
// @Description Retrieve all active vaults
// @Tags vaults
// @Accept json
// @Produce json
// @Success 200 {array} models.Investment
// @Failure 500 {string} string "Internal server error"
// @Router /vaults [get]
func (h *InvestmentHandler) HandleGetActiveVaults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vaults, err := h.investmentService.GetActiveVaults(r.Context())
	if err != nil {
		http.Error(w, "Failed to get active vaults: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(vaults)
}

// HandleGetVaultByName handles GET /api/vaults/{name}
// @Summary Get vault by name
// @Description Retrieve a specific vault by name
// @Tags vaults
// @Accept json
// @Produce json
// @Param name path string true "Vault name"
// @Success 200 {object} models.Investment
// @Failure 404 {string} string "Vault not found"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{name} [get]
func (h *InvestmentHandler) HandleGetVaultByName(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := extractVaultNameFromPath(r)

	if name == "" {
		http.Error(w, "Vault name is required", http.StatusBadRequest)
		return
	}

	vault, err := h.investmentService.GetVaultByName(r.Context(), name)
	if err != nil {
		http.Error(w, "Failed to get vault: "+err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(vault)
}

// HandleDepositToVault handles POST /api/vaults/{name}/deposit
// @Summary Deposit to vault
// @Description Add a deposit to an existing vault
// @Tags vaults
// @Accept json
// @Produce json
// @Param name path string true "Vault name"
// @Param deposit body VaultDepositRequest true "Deposit request"
// @Success 200 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 404 {string} string "Vault not found"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{name}/deposit [post]
func (h *InvestmentHandler) HandleDepositToVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vaultName := extractVaultNameFromPath(r)

	if vaultName == "" {
		http.Error(w, "Vault name is required", http.StatusBadRequest)
		return
	}

	var req VaultDepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Quantity.IsZero() || req.Quantity.IsNegative() {
		http.Error(w, "quantity must be positive", http.StatusBadRequest)
		return
	}

	if req.Cost.IsNegative() {
		http.Error(w, "cost cannot be negative", http.StatusBadRequest)
		return
	}

	if req.SourceAccount == "" {
		http.Error(w, "source account is required", http.StatusBadRequest)
		return
	}

	vault, err := h.investmentService.DepositToVault(r.Context(), vaultName, req.Quantity, req.Cost, req.SourceAccount)
	if err != nil {
		http.Error(w, "Failed to deposit to vault: "+err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(vault)
}

// HandleWithdrawFromVault handles POST /api/vaults/{name}/withdraw
// @Summary Withdraw from vault
// @Description Process a withdrawal from a vault
// @Tags vaults
// @Accept json
// @Produce json
// @Param name path string true "Vault name"
// @Param withdrawal body VaultWithdrawalRequest true "Withdrawal request"
// @Success 200 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 404 {string} string "Vault not found"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{name}/withdraw [post]
func (h *InvestmentHandler) HandleWithdrawFromVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vaultName := extractVaultNameFromPath(r)

	if vaultName == "" {
		http.Error(w, "Vault name is required", http.StatusBadRequest)
		return
	}

	var req VaultWithdrawalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Quantity.IsZero() || req.Quantity.IsNegative() {
		http.Error(w, "quantity must be positive", http.StatusBadRequest)
		return
	}

	if req.Value.IsNegative() {
		http.Error(w, "value cannot be negative", http.StatusBadRequest)
		return
	}

	if req.TargetAccount == "" {
		http.Error(w, "target account is required", http.StatusBadRequest)
		return
	}

	vault, err := h.investmentService.WithdrawFromVault(r.Context(), vaultName, req.Quantity, req.Value, req.TargetAccount)
	if err != nil {
		http.Error(w, "Failed to withdraw from vault: "+err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(vault)
}

// HandleEndVault handles POST /api/vaults/{name}/end
// @Summary End a vault
// @Description Mark a vault as ended
// @Tags vaults
// @Accept json
// @Produce json
// @Param name path string true "Vault name"
// @Success 200 {object} models.Investment
// @Failure 400 {string} string "Bad request"
// @Failure 404 {string} string "Vault not found"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{name}/end [post]
func (h *InvestmentHandler) HandleEndVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vaultName := extractVaultNameFromPath(r)

	if vaultName == "" {
		http.Error(w, "Vault name is required", http.StatusBadRequest)
		return
	}

	vault, err := h.investmentService.EndVault(r.Context(), vaultName)
	if err != nil {
		http.Error(w, "Failed to end vault: "+err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(vault)
}

// HandleDeleteVault handles DELETE /api/vaults/{name}
// @Summary Delete a vault
// @Description Permanently delete a vault (only allowed for ended vaults)
// @Tags vaults
// @Accept json
// @Produce json
// @Param name path string true "Vault name"
// @Success 200 {string} string "Vault deleted successfully"
// @Failure 400 {string} string "Bad request"
// @Failure 404 {string} string "Vault not found"
// @Failure 500 {string} string "Internal server error"
// @Router /vaults/{name} [delete]
func (h *InvestmentHandler) HandleDeleteVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vaultName := extractVaultNameFromPath(r)

	if vaultName == "" {
		http.Error(w, "Vault name is required", http.StatusBadRequest)
		return
	}

	err := h.investmentService.DeleteVault(r.Context(), vaultName)
	if err != nil {
		http.Error(w, "Failed to delete vault: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Vault deleted successfully"})
}

// Request/Response DTOs for vault operations

type CreateVaultRequest struct {
	Name           string          `json:"name"`
	Asset          string          `json:"asset"`
	Account        string          `json:"account"`
	InitialDeposit decimal.Decimal `json:"initialDeposit"`
	Horizon        string          `json:"horizon,omitempty"`
}

type VaultDepositRequest struct {
	Quantity      decimal.Decimal `json:"quantity"`
	Cost          decimal.Decimal `json:"cost"`
	SourceAccount string          `json:"sourceAccount"`
}

type VaultWithdrawalRequest struct {
	Quantity      decimal.Decimal `json:"quantity"`
	Value         decimal.Decimal `json:"value"`
	TargetAccount string          `json:"targetAccount"`
}
