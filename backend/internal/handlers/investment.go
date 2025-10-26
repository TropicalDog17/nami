package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
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
