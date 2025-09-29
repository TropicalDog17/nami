package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/tropicaldog17/nami/internal/services"
)

type PriceHandler struct {
	service  services.AssetPriceService
	resolver services.PriceMappingResolver
	fx       services.FXHistoryService
}

func NewPriceHandler(service services.AssetPriceService, resolver services.PriceMappingResolver, fx services.FXHistoryService) *PriceHandler {
	return &PriceHandler{service: service, resolver: resolver, fx: fx}
}

// GET /api/prices/daily?symbol=BTC&currency=USD&start=2024-09-28&end=2025-09-28
// @Summary Get daily asset prices
// @Description Get daily prices for a symbol or asset ID in a currency
// @Tags prices
// @Produce json
// @Param symbol query string false "Asset symbol (e.g., BTC)"
// @Param asset_id query string false "Asset ID"
// @Param currency query string false "Target currency (default USD)"
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {array} map[string]interface{}
// @Failure 400 {string} string "Bad request"
// @Failure 500 {string} string "Internal server error"
// @Router /prices/daily [get]
func (h *PriceHandler) HandleDaily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	symbol := q.Get("symbol")
	assetIDStr := q.Get("asset_id")
	if symbol == "" && assetIDStr == "" {
		http.Error(w, "symbol or asset_id is required", http.StatusBadRequest)
		return
	}
	currency := q.Get("currency")
	if currency == "" {
		currency = "USD"
	}
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
		end = time.Now()
		start = end.AddDate(0, 0, -365)
	}
	// If currency is not USD, we will fetch in mapping quote (default USD) and convert
	quote := "USD"
	if symbol != "" {
		if m, _ := h.resolver.ResolveBySymbol(r.Context(), symbol); m != nil {
			quote = m.QuoteCurrency
		}
	}

	prices, err := h.service.GetRange(r.Context(), symbol, quote, start, end)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if quote == currency {
		json.NewEncoder(w).Encode(prices)
		return
	}

	// Only support USD->VND for now via FX
	if quote == "USD" && currency == "VND" {
		// convert each by date rate USD->VND
		converted := make([]map[string]interface{}, 0, len(prices))
		for _, p := range prices {
			rate, err := h.fx.GetDaily(r.Context(), "USD", "VND", p.Date)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			converted = append(converted, map[string]interface{}{
				"symbol":     p.Symbol,
				"currency":   currency,
				"date":       p.Date,
				"price":      p.Price.Mul(rate.Rate),
				"source":     p.Source,
				"created_at": p.CreatedAt,
			})
		}
		json.NewEncoder(w).Encode(converted)
		return
	}

	http.Error(w, "conversion not supported", http.StatusBadRequest)
}
