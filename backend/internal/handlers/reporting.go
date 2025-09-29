package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type ReportingHandler struct {
	service services.ReportingService
}

func NewReportingHandler(service services.ReportingService) *ReportingHandler {
	return &ReportingHandler{service: service}
}

// HandleHoldings handles GET /api/reports/holdings
// @Summary Get holdings
// @Description Get current holdings as of a date
// @Tags reports
// @Produce json
// @Param as_of query string false "As of date (YYYY-MM-DD)"
// @Success 200 {array} models.Holding
// @Failure 500 {string} string "Internal server error"
// @Router /reports/holdings [get]
func (h *ReportingHandler) HandleHoldings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse asOf date parameter (optional, defaults to now)
	asOf := time.Now()
	if asOfStr := r.URL.Query().Get("as_of"); asOfStr != "" {
		if parsed, err := time.Parse("2006-01-02", asOfStr); err == nil {
			asOf = parsed
		}
	}

	holdings, err := h.service.GetHoldings(r.Context(), asOf)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(holdings)
}

// HandleHoldingsSummary handles GET /api/reports/holdings/summary
// @Summary Get holdings summary
// @Description Get aggregated holdings summary as of a date
// @Tags reports
// @Produce json
// @Param as_of query string false "As of date (YYYY-MM-DD)"
// @Success 200 {object} models.HoldingSummary
// @Failure 500 {string} string "Internal server error"
// @Router /reports/holdings/summary [get]
func (h *ReportingHandler) HandleHoldingsSummary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse asOf date parameter (optional, defaults to now)
	asOf := time.Now()
	if asOfStr := r.URL.Query().Get("as_of"); asOfStr != "" {
		if parsed, err := time.Parse("2006-01-02", asOfStr); err == nil {
			asOf = parsed
		}
	}

	byAsset, err := h.service.GetHoldingsByAsset(r.Context(), asOf)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	byAccount, err := h.service.GetHoldingsByAccount(r.Context(), asOf)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Calculate totals
	var totalUSD, totalVND decimal.Decimal
	for _, holding := range byAsset {
		totalUSD = totalUSD.Add(holding.ValueUSD)
		totalVND = totalVND.Add(holding.ValueVND)
	}

	summary := &models.HoldingSummary{
		TotalValueUSD: totalUSD,
		TotalValueVND: totalVND,
		ByAsset:       byAsset,
		ByAccount:     byAccount,
		LastUpdated:   asOf,
	}

	json.NewEncoder(w).Encode(summary)
}

// HandleCashFlow handles GET /api/reports/cashflow
// @Summary Get cash flow report
// @Description Get cash flow over a period
// @Tags reports
// @Produce json
// @Param start_date query string false "Start date (YYYY-MM-DD)"
// @Param end_date query string false "End date (YYYY-MM-DD)"
// @Param days query int false "Days back from end_date"
// @Success 200 {object} models.CashFlowReport
// @Failure 400 {string} string "Invalid period parameters"
// @Failure 500 {string} string "Internal server error"
// @Router /reports/cashflow [get]
func (h *ReportingHandler) HandleCashFlow(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	period, err := h.parsePeriod(r)
	if err != nil {
		http.Error(w, "Invalid period parameters: "+err.Error(), http.StatusBadRequest)
		return
	}

	report, err := h.service.GetCashFlow(r.Context(), period)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(report)
}

// HandleSpending handles GET /api/reports/spending
// @Summary Get spending report
// @Description Get spending over a period
// @Tags reports
// @Produce json
// @Param start_date query string false "Start date (YYYY-MM-DD)"
// @Param end_date query string false "End date (YYYY-MM-DD)"
// @Param days query int false "Days back from end_date"
// @Success 200 {object} models.SpendingReport
// @Failure 400 {string} string "Invalid period parameters"
// @Failure 500 {string} string "Internal server error"
// @Router /reports/spending [get]
func (h *ReportingHandler) HandleSpending(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	period, err := h.parsePeriod(r)
	if err != nil {
		http.Error(w, "Invalid period parameters: "+err.Error(), http.StatusBadRequest)
		return
	}

	report, err := h.service.GetSpending(r.Context(), period)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(report)
}

// HandlePnL handles GET /api/reports/pnl
// @Summary Get PnL report
// @Description Get profit and loss over a period
// @Tags reports
// @Produce json
// @Param start_date query string false "Start date (YYYY-MM-DD)"
// @Param end_date query string false "End date (YYYY-MM-DD)"
// @Param days query int false "Days back from end_date"
// @Success 200 {object} models.PnLReport
// @Failure 400 {string} string "Invalid period parameters"
// @Failure 500 {string} string "Internal server error"
// @Router /reports/pnl [get]
func (h *ReportingHandler) HandlePnL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	period, err := h.parsePeriod(r)
	if err != nil {
		http.Error(w, "Invalid period parameters: "+err.Error(), http.StatusBadRequest)
		return
	}

	report, err := h.service.GetPnL(r.Context(), period)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(report)
}

// HandleOutstandingBorrows handles GET /api/reports/borrows/outstanding
// @Summary Get outstanding borrows
// @Description Get list of outstanding borrows as of a date
// @Tags reports
// @Produce json
// @Param as_of query string false "As of date (YYYY-MM-DD)"
// @Success 200 {array} models.OutstandingBorrow
// @Failure 500 {string} string "Internal server error"
// @Router /reports/borrows/outstanding [get]
func (h *ReportingHandler) HandleOutstandingBorrows(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	asOf := time.Now()
	if asOfStr := r.URL.Query().Get("as_of"); asOfStr != "" {
		if parsed, err := time.Parse("2006-01-02", asOfStr); err == nil {
			asOf = parsed
		}
	}
	data, err := h.service.GetOutstandingBorrows(r.Context(), asOf)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// convert map to slice of OutstandingBorrow
	var result []models.OutstandingBorrow
	for asset, accounts := range data {
		for account, amount := range accounts {
			result = append(result, models.OutstandingBorrow{Asset: asset, Account: account, Amount: amount})
		}
	}
	json.NewEncoder(w).Encode(result)
}

// parsePeriod parses start_date and end_date query parameters
func (h *ReportingHandler) parsePeriod(r *http.Request) (models.Period, error) {
	// Default to last 30 days if no parameters provided
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

	if startStr := r.URL.Query().Get("start_date"); startStr != "" {
		if parsed, err := time.Parse("2006-01-02", startStr); err != nil {
			return models.Period{}, err
		} else {
			startDate = parsed
		}
	}

	if endStr := r.URL.Query().Get("end_date"); endStr != "" {
		if parsed, err := time.Parse("2006-01-02", endStr); err != nil {
			return models.Period{}, err
		} else {
			endDate = parsed
		}
	}

	// Parse days parameter as alternative to start_date
	if daysStr := r.URL.Query().Get("days"); daysStr != "" {
		if days, err := strconv.Atoi(daysStr); err == nil && days > 0 {
			startDate = endDate.AddDate(0, 0, -days)
		}
	}

	return models.Period{
		StartDate: startDate,
		EndDate:   endDate,
	}, nil
}
