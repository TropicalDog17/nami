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
