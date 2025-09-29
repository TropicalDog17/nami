package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/tropicaldog17/nami/internal/services"
)

type FXHandler struct {
	history services.FXHistoryService
}

func NewFXHandler(history services.FXHistoryService) *FXHandler {
	return &FXHandler{history: history}
}

// GET /api/fx/usd-vnd?days=365
// GET /api/fx/history?from=USD&to=VND&start=2024-09-28&end=2025-09-28
// @Summary Get FX history
// @Description Get daily FX rates for a period
// @Tags fx
// @Produce json
// @Param from query string false "Base currency (default USD)"
// @Param to query string false "Quote currency (default VND)"
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {string} string "Internal server error"
// @Router /fx/history [get]
func (h *FXHandler) HandleHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	if from == "" {
		from = "USD"
	}
	if to == "" {
		to = "VND"
	}

	// range by start/end or days
	var start, end time.Time
	if startStr := q.Get("start"); startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			start = t
		}
	}
	if endStr := q.Get("end"); endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t
		}
	}
	if start.IsZero() || end.IsZero() {
		// default: last 365 days
		end = time.Now()
		start = end.AddDate(0, 0, -365)
	}

	// For list queries, only return existing DB records (no fetching)
	rates, err := h.history.ListExistingRange(r.Context(), from, to, start, end)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(rates)
}

// GET /api/fx/today?from=USD&to=VND
// @Summary Get today's FX rate (fetched and stored)
// @Description Fetch today's FX rate for a currency pair, cache it, and return
// @Tags fx
// @Produce json
// @Param from query string false "Base currency (default USD)"
// @Param to query string false "Quote currency (default VND)"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {string} string "Internal server error"
// @Router /fx/today [get]
func (h *FXHandler) HandleToday(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	if from == "" {
		from = "USD"
	}
	if to == "" {
		to = "VND"
	}

	today := time.Now().UTC()
	rate, err := h.history.GetDaily(r.Context(), from, to, today)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(rate)
}
