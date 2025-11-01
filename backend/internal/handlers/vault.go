package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"math"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

// VaultHandler exposes high-level vault operations backed by investments
type VaultHandler struct {
	investmentService services.InvestmentService
    priceService      services.AssetPriceService
}

func NewVaultHandler(investmentService services.InvestmentService, priceService services.AssetPriceService) *VaultHandler {
    return &VaultHandler{investmentService: investmentService, priceService: priceService}
}

// vaultDTO is a projection returned to the frontend
type vaultDTO struct {
	ID                  string           `json:"id"`
	IsVault             bool             `json:"is_vault"`
	VaultName           string           `json:"vault_name,omitempty"`
	VaultStatus         string           `json:"vault_status,omitempty"`
	VaultEndedAt        *time.Time       `json:"vault_ended_at,omitempty"`
	Asset               string           `json:"asset"`
	Account             string           `json:"account"`
	Horizon             *string          `json:"horizon,omitempty"`
	DepositDate         time.Time        `json:"deposit_date"`
	DepositQty          decimal.Decimal  `json:"deposit_qty"`
	DepositCost         decimal.Decimal  `json:"deposit_cost"`
	DepositUnitCost     decimal.Decimal  `json:"deposit_unit_cost"`
	WithdrawalQty       decimal.Decimal  `json:"withdrawal_qty"`
	WithdrawalValue     decimal.Decimal  `json:"withdrawal_value"`
	WithdrawalUnitPrice decimal.Decimal  `json:"withdrawal_unit_price"`
	PnL                 decimal.Decimal  `json:"pnl"`
	PnLPercent          decimal.Decimal  `json:"pnl_percent"`
	IsOpen              bool             `json:"is_open"`
	RealizedPnL         decimal.Decimal  `json:"realized_pnl"`
	RemainingQty        decimal.Decimal  `json:"remaining_qty"`
	CreatedAt           time.Time        `json:"created_at"`
	UpdatedAt           time.Time        `json:"updated_at"`
	APRPercent          *decimal.Decimal `json:"apr_percent,omitempty"`
    // Live metrics (optional, computed at request time)
    AsOf                *time.Time       `json:"as_of,omitempty"`
    CurrentPriceUSD     *decimal.Decimal `json:"current_price_usd,omitempty"`
    CurrentValueUSD     *decimal.Decimal `json:"current_value_usd,omitempty"`
    ROIRealTimePercent  *decimal.Decimal `json:"roi_realtime_percent,omitempty"`
    BenchmarkAsset      *string          `json:"benchmark_asset,omitempty"`
    BenchmarkROIPercent *decimal.Decimal `json:"benchmark_roi_percent,omitempty"`
    BenchmarkAPRPercent *decimal.Decimal `json:"benchmark_apr_percent,omitempty"`
}

func mapInvestmentToVaultDTO(inv *models.Investment) *vaultDTO {
	status := "ended"
	if inv.IsOpen {
		status = "active"
	}

	// Compute APR only for closed positions where we have a holding period
	var apr *decimal.Decimal
	if !inv.IsOpen {
		// Determine holding period in days
		end := inv.WithdrawalDate
		if end == nil {
			t := inv.UpdatedAt
			end = &t
		}
		days := end.Sub(inv.DepositDate).Hours() / 24.0
		if days > 0 {
			// ROI decimal from percent
			if !inv.PnLPercent.IsZero() {
				roiDecimal := inv.PnLPercent.Div(decimal.NewFromInt(100))
				// APR = (1+ROI)^(365/days) - 1
				exponent := decimal.NewFromInt(365).Div(decimal.NewFromFloat(days))
				onePlusROI := decimal.NewFromInt(1).Add(roiDecimal)
				// decimal library lacks Pow on decimals directly; use float fallback conservatively
				aprFloat := (onePlusROI.InexactFloat64())
				expFloat := exponent.InexactFloat64()
				if aprFloat > 0 {
					aprVal := decimal.NewFromFloat(pow(aprFloat, expFloat) - 1).Mul(decimal.NewFromInt(100))
					apr = &aprVal
				}
			}
		}
	}

	dto := &vaultDTO{
		ID:      inv.ID,
		IsVault: true,
		// VaultName intentionally omitted to force frontend to use ID for routing
		VaultStatus:         status,
		VaultEndedAt:        inv.WithdrawalDate,
		Asset:               inv.Asset,
		Account:             inv.Account,
		Horizon:             inv.Horizon,
		DepositDate:         inv.DepositDate,
		DepositQty:          inv.DepositQty,
		DepositCost:         inv.DepositCost,
		DepositUnitCost:     inv.DepositUnitCost,
		WithdrawalQty:       inv.WithdrawalQty,
		WithdrawalValue:     inv.WithdrawalValue,
		WithdrawalUnitPrice: inv.WithdrawalUnitPrice,
		PnL:                 inv.PnL,
		PnLPercent:          inv.PnLPercent,
		IsOpen:              inv.IsOpen,
		RealizedPnL:         inv.RealizedPnL,
		RemainingQty:        inv.RemainingQty,
		CreatedAt:           inv.CreatedAt,
		UpdatedAt:           inv.UpdatedAt,
		APRPercent:          apr,
	}
	return dto
}

// enrichVaultWithLiveMetrics enriches the DTO with live price-based metrics at second precision
func (h *VaultHandler) enrichVaultWithLiveMetrics(r *http.Request, inv *models.Investment, dto *vaultDTO) {
    if h.priceService == nil || inv == nil || dto == nil {
        return
    }
    ctx := r.Context()
    // Defaults
    currency := "USD"
    benchmark := "BTC"
    q := r.URL.Query()
    if v := q.Get("currency"); v != "" {
        currency = v
    }
    if v := q.Get("benchmark"); v != "" {
        benchmark = v
    }

    now := time.Now().UTC().Truncate(time.Second)
    dto.AsOf = &now

    // Get latest price for vault asset
    ap, err := h.priceService.GetLatest(ctx, inv.Asset, currency)
    if err == nil && ap != nil {
        price := ap.Price
        dto.CurrentPriceUSD = &price
        // Compute current value = remaining qty * price
        remaining := inv.DepositQty.Sub(inv.WithdrawalQty)
        if remaining.IsNegative() {
            remaining = decimal.Zero
        }
        value := remaining.Mul(price)
        dto.CurrentValueUSD = &value

        // Compute ROI and APR to date including withdrawals cash-in
        if !inv.DepositCost.IsZero() {
            totalValue := value.Add(inv.WithdrawalValue)
            pnl := totalValue.Sub(inv.DepositCost)
            roiPct := pnl.Div(inv.DepositCost).Mul(decimal.NewFromInt(100))
            dto.ROIRealTimePercent = &roiPct

            // APR using per-second precision
            elapsedSec := now.Sub(inv.DepositDate).Seconds()
            if elapsedSec < 1 {
                elapsedSec = 1
            }
            onePlusROI := decimal.NewFromInt(1).Add(roiPct.Div(decimal.NewFromInt(100)))
            onePlusROIF := onePlusROI.InexactFloat64()
            if onePlusROIF > 0 {
                secondsInYear := 365.0 * 24.0 * 3600.0
                exponent := secondsInYear / elapsedSec
                aprNow := decimal.NewFromFloat(pow(onePlusROIF, exponent) - 1).Mul(decimal.NewFromInt(100))
                dto.APRPercent = &aprNow
            }
        }
    }

    // Benchmark vs BTC (or specified benchmark)
    if benchmark != "" {
        b := benchmark
        dto.BenchmarkAsset = &b
        // Get start price (use daily historical for the deposit day) and latest price
        startPrice, err1 := h.priceService.GetDaily(ctx, benchmark, currency, inv.DepositDate)
        latestPrice, err2 := h.priceService.GetLatest(ctx, benchmark, currency)
        if err1 == nil && err2 == nil && startPrice != nil && latestPrice != nil && !startPrice.Price.IsZero() {
            ratio := latestPrice.Price.Div(startPrice.Price)
            benchROI := ratio.Sub(decimal.NewFromInt(1)).Mul(decimal.NewFromInt(100))
            dto.BenchmarkROIPercent = &benchROI

            elapsedSec := now.Sub(inv.DepositDate).Seconds()
            if elapsedSec < 1 {
                elapsedSec = 1
            }
            onePlusROI := decimal.NewFromInt(1).Add(benchROI.Div(decimal.NewFromInt(100)))
            onePlusROIF := onePlusROI.InexactFloat64()
            if onePlusROIF > 0 {
                secondsInYear := 365.0 * 24.0 * 3600.0
                exponent := secondsInYear / elapsedSec
                benchAPR := decimal.NewFromFloat(pow(onePlusROIF, exponent) - 1).Mul(decimal.NewFromInt(100))
                dto.BenchmarkAPRPercent = &benchAPR
            }
        }
    }
}

// enrichVaultWithManualMetrics computes metrics using a manually provided current value or unit price
func (h *VaultHandler) enrichVaultWithManualMetrics(r *http.Request, inv *models.Investment, dto *vaultDTO, manual struct {
    CurrentValueUSD     *float64 `json:"current_value_usd"`
    CurrentUnitPriceUSD *float64 `json:"current_unit_price_usd"`
    Benchmark           *string  `json:"benchmark"`
    Currency            *string  `json:"currency"`
}) {
    if inv == nil || dto == nil {
        return
    }

    // Defaults
    currency := "USD"
    if manual.Currency != nil && *manual.Currency != "" {
        currency = *manual.Currency
    }
    benchmark := "BTC"
    if manual.Benchmark != nil && *manual.Benchmark != "" {
        benchmark = *manual.Benchmark
    }

    now := time.Now().UTC().Truncate(time.Second)
    dto.AsOf = &now

    remaining := inv.DepositQty.Sub(inv.WithdrawalQty)
    if remaining.IsNegative() {
        remaining = decimal.Zero
    }

    var unitPrice decimal.Decimal
    var value decimal.Decimal
    if manual.CurrentValueUSD != nil {
        value = decimal.NewFromFloat(*manual.CurrentValueUSD)
        if remaining.IsPositive() {
            unitPrice = value.Div(remaining)
        } else {
            unitPrice = decimal.Zero
        }
    } else if manual.CurrentUnitPriceUSD != nil {
        unitPrice = decimal.NewFromFloat(*manual.CurrentUnitPriceUSD)
        value = unitPrice.Mul(remaining)
    }

    // Set current price/value
    if unitPrice.String() != "" {
        p := unitPrice
        dto.CurrentPriceUSD = &p
    }
    if value.String() != "" {
        v := value
        dto.CurrentValueUSD = &v
    }

    // Compute ROI and APR
    if !inv.DepositCost.IsZero() {
        totalValue := value.Add(inv.WithdrawalValue)
        pnl := totalValue.Sub(inv.DepositCost)
        roiPct := pnl.Div(inv.DepositCost).Mul(decimal.NewFromInt(100))
        dto.ROIRealTimePercent = &roiPct

        elapsedSec := now.Sub(inv.DepositDate).Seconds()
        if elapsedSec < 1 {
            elapsedSec = 1
        }
        onePlusROI := decimal.NewFromInt(1).Add(roiPct.Div(decimal.NewFromInt(100)))
        onePlusROIF := onePlusROI.InexactFloat64()
        if onePlusROIF > 0 {
            secondsInYear := 365.0 * 24.0 * 3600.0
            exponent := secondsInYear / elapsedSec
            aprNow := decimal.NewFromFloat(pow(onePlusROIF, exponent) - 1).Mul(decimal.NewFromInt(100))
            dto.APRPercent = &aprNow
        }
    }

    // Benchmark vs BTC (or specified benchmark)
    if benchmark != "" && h.priceService != nil {
        b := benchmark
        dto.BenchmarkAsset = &b
        startPrice, err1 := h.priceService.GetDaily(r.Context(), benchmark, currency, inv.DepositDate)
        latestPrice, err2 := h.priceService.GetLatest(r.Context(), benchmark, currency)
        if err1 == nil && err2 == nil && startPrice != nil && latestPrice != nil && !startPrice.Price.IsZero() {
            ratio := latestPrice.Price.Div(startPrice.Price)
            benchROI := ratio.Sub(decimal.NewFromInt(1)).Mul(decimal.NewFromInt(100))
            dto.BenchmarkROIPercent = &benchROI

            elapsedSec := now.Sub(inv.DepositDate).Seconds()
            if elapsedSec < 1 {
                elapsedSec = 1
            }
            onePlusROI := decimal.NewFromInt(1).Add(benchROI.Div(decimal.NewFromInt(100)))
            onePlusROIF := onePlusROI.InexactFloat64()
            if onePlusROIF > 0 {
                secondsInYear := 365.0 * 24.0 * 3600.0
                exponent := secondsInYear / elapsedSec
                benchAPR := decimal.NewFromFloat(pow(onePlusROIF, exponent) - 1).Mul(decimal.NewFromInt(100))
                dto.BenchmarkAPRPercent = &benchAPR
            }
        }
    }
}
// pow is a simple helper using math.Pow on floats
func pow(a, b float64) float64 {
	// defer to math.Pow to avoid importing in many places
	// small wrapper for testability
	return float64Pow(a, b)
}

// separated for easy mocking in tests
var float64Pow = func(a, b float64) float64 {
	// import locally to keep package imports tidy
	//nolint:all
	return func() float64 { return mathPow(a, b) }()
}

// indirection for math.Pow
var mathPow = func(a, b float64) float64 { return math.Pow(a, b) }

// HandleVaults handles GET /api/vaults and POST /api/vaults
func (h *VaultHandler) HandleVaults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		// Optional is_open filter
		var isOpenPtr *bool
		if v := r.URL.Query().Get("is_open"); v != "" {
			if b, err := strconv.ParseBool(v); err == nil {
				isOpenPtr = &b
			}
		}
		filter := &models.InvestmentFilter{IsOpen: isOpenPtr}
		invs, err := h.investmentService.GetInvestments(r.Context(), filter)
		if err != nil {
			http.Error(w, "Failed to list vaults: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// Map and return
		result := make([]*vaultDTO, 0, len(invs))
		for _, inv := range invs {
			inv.RealizedPnL = inv.PnL
			inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
			result = append(result, mapInvestmentToVaultDTO(inv))
		}
		json.NewEncoder(w).Encode(result)
		return

	case http.MethodPost:
		// Create a new vault via stake action
		var body struct {
			Asset       string  `json:"asset"`
			Account     string  `json:"account"`
			Horizon     *string `json:"horizon,omitempty"`
			DepositQty  float64 `json:"depositQty"`
			DepositCost float64 `json:"depositCost"`
			Date        string  `json:"date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if body.Asset == "" || body.Account == "" || body.DepositQty <= 0 || body.DepositCost < 0 {
			http.Error(w, "asset, account, depositQty (>0), and depositCost (>=0) are required", http.StatusBadRequest)
			return
		}

		// Parse date
		var depositDate time.Time
		if body.Date != "" {
			if parsed, err := time.Parse("2006-01-02", body.Date); err == nil {
				depositDate = parsed
			} else {
				http.Error(w, "Invalid date format, use YYYY-MM-DD", http.StatusBadRequest)
				return
			}
		} else {
			depositDate = time.Now()
		}

        // Create stake transaction
        // Special handling for USD-only vaults: treat quantity in USD with unit price = 1
        qty := decimal.NewFromFloat(body.DepositQty)
        unitPriceLocal := decimal.NewFromFloat(0)
        if strings.ToUpper(body.Asset) == "USD" {
            qty = decimal.NewFromFloat(body.DepositCost)
            unitPriceLocal = decimal.NewFromInt(1)
        } else if body.DepositQty > 0 {
            unitPriceLocal = decimal.NewFromFloat(body.DepositCost).Div(decimal.NewFromFloat(body.DepositQty))
        }

		stakeTx := &models.Transaction{
			Date:       depositDate,
			Type:       models.ActionStake,
			Asset:      body.Asset,
			Account:    body.Account,
			Quantity:   qty,
			PriceLocal: unitPriceLocal,
			FXToUSD:    decimal.NewFromInt(1),
			FXToVND:    decimal.NewFromInt(1),
			Horizon:    body.Horizon,
		}
		if err := stakeTx.PreSave(); err != nil {
			http.Error(w, "Invalid stake transaction: "+err.Error(), http.StatusBadRequest)
			return
		}

		// Create investment via stake
		created, err := h.investmentService.ProcessStake(r.Context(), stakeTx)
		if err != nil {
			http.Error(w, "Failed to create vault: "+err.Error(), http.StatusBadRequest)
			return
		}

		created.RealizedPnL = created.PnL
		created.RemainingQty = created.DepositQty.Sub(created.WithdrawalQty)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(mapInvestmentToVaultDTO(created))
		return

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// HandleVault handles routes under /api/vaults/{id}/...
func (h *VaultHandler) HandleVault(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if !strings.HasPrefix(r.URL.Path, "/api/vaults/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/vaults/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	idOrName := parts[0]
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
		// Only ID lookup is supported for now
		inv, err := h.investmentService.GetInvestmentByID(r.Context(), idOrName)
		if err != nil {
			http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
			return
		}
		inv.RealizedPnL = inv.PnL
		inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
    dto := mapInvestmentToVaultDTO(inv)
    if r.URL.Query().Get("enrich") == "true" {
        h.enrichVaultWithLiveMetrics(r, inv, dto)
    }
    json.NewEncoder(w).Encode(dto)
		return

	case http.MethodPost:
		switch action {
		case "deposit":
			h.handleDeposit(w, r, idOrName)
			return
		case "withdraw":
			h.handleWithdraw(w, r, idOrName)
			return
		case "end":
			h.handleEnd(w, r, idOrName)
			return
		case "refresh":
			h.handleRefresh(w, r, idOrName)
			return
		case "delete":
			h.handleDelete(w, r, idOrName)
			return
		default:
			http.Error(w, "Unknown action", http.StatusNotFound)
			return
		}
	case http.MethodDelete:
		// Delete the vault and all related transactions
		if action != "" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := h.investmentService.DeleteInvestment(r.Context(), idOrName); err != nil {
			http.Error(w, "Failed to delete vault: "+err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (h *VaultHandler) handleDeposit(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		Quantity      float64 `json:"quantity"`
		Cost          float64 `json:"cost"`
		SourceAccount string  `json:"sourceAccount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.Quantity <= 0 || body.Cost < 0 {
		http.Error(w, "quantity must be > 0 and cost >= 0", http.StatusBadRequest)
		return
	}

	inv, err := h.investmentService.GetInvestmentByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

    qty := decimal.NewFromFloat(body.Quantity)
    unitPriceLocal := decimal.NewFromFloat(0)
    if strings.ToUpper(inv.Asset) == "USD" {
        // For USD vaults, quantity is USD and unit price is 1
        qty = decimal.NewFromFloat(body.Cost)
        unitPriceLocal = decimal.NewFromInt(1)
    } else if body.Quantity > 0 {
        unitPriceLocal = decimal.NewFromFloat(body.Cost).Div(decimal.NewFromFloat(body.Quantity))
    }

	stakeTx := &models.Transaction{
		Date:         time.Now(),
		Type:         models.ActionStake,
		Asset:        inv.Asset,
		Account:      inv.Account,
		Quantity:     qty,
		PriceLocal:   unitPriceLocal,
		FXToUSD:      decimal.NewFromInt(1),
		FXToVND:      decimal.NewFromInt(1),
		InvestmentID: &inv.ID,
		InternalFlow: func() *bool { b := true; return &b }(),
	}
	if err := stakeTx.PreSave(); err != nil {
		http.Error(w, "Invalid stake transaction: "+err.Error(), http.StatusBadRequest)
		return
	}

	updated, err := h.investmentService.ProcessStake(r.Context(), stakeTx)
	if err != nil {
		http.Error(w, "Failed to process deposit: "+err.Error(), http.StatusBadRequest)
		return
	}
    updated.RealizedPnL = updated.PnL
    updated.RemainingQty = updated.DepositQty.Sub(updated.WithdrawalQty)
    dto := mapInvestmentToVaultDTO(updated)
    h.enrichVaultWithLiveMetrics(r, updated, dto)
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(dto)
}

func (h *VaultHandler) handleWithdraw(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		Quantity      float64 `json:"quantity"`
		Value         float64 `json:"value"`
		TargetAccount string  `json:"targetAccount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.Quantity <= 0 || body.Value < 0 {
		http.Error(w, "quantity must be > 0 and value >= 0", http.StatusBadRequest)
		return
	}

	inv, err := h.investmentService.GetInvestmentByID(r.Context(), id)
	if err != nil {
		http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
		return
	}

    qty := decimal.NewFromFloat(body.Quantity)
    unitPriceLocal := decimal.NewFromFloat(0)
    if strings.ToUpper(inv.Asset) == "USD" {
        // For USD vaults, quantity is USD and unit price is 1
        qty = decimal.NewFromFloat(body.Value)
        unitPriceLocal = decimal.NewFromInt(1)
    } else if body.Quantity > 0 {
        unitPriceLocal = decimal.NewFromFloat(body.Value).Div(decimal.NewFromFloat(body.Quantity))
    }

	unstakeTx := &models.Transaction{
		Date:         time.Now(),
		Type:         models.ActionUnstake,
		Asset:        inv.Asset,
		Account:      inv.Account,
		Quantity:     qty,
		PriceLocal:   unitPriceLocal,
		FXToUSD:      decimal.NewFromInt(1),
		FXToVND:      decimal.NewFromInt(1),
		InvestmentID: &inv.ID,
		InternalFlow: func() *bool { b := true; return &b }(),
	}
	if err := unstakeTx.PreSave(); err != nil {
		http.Error(w, "Invalid unstake transaction: "+err.Error(), http.StatusBadRequest)
		return
	}

	updated, err := h.investmentService.ProcessUnstake(r.Context(), unstakeTx)
	if err != nil {
		http.Error(w, "Failed to process withdrawal: "+err.Error(), http.StatusBadRequest)
		return
	}
    updated.RealizedPnL = updated.PnL
    updated.RemainingQty = updated.DepositQty.Sub(updated.WithdrawalQty)
    dto := mapInvestmentToVaultDTO(updated)
    h.enrichVaultWithLiveMetrics(r, updated, dto)
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(dto)
}

func (h *VaultHandler) handleEnd(w http.ResponseWriter, r *http.Request, id string) {
	updated, err := h.investmentService.CloseInvestment(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to end vault: "+err.Error(), http.StatusBadRequest)
		return
	}
	updated.RealizedPnL = updated.PnL
	updated.RemainingQty = updated.DepositQty.Sub(updated.WithdrawalQty)
    dto := mapInvestmentToVaultDTO(updated)
    h.enrichVaultWithLiveMetrics(r, updated, dto)
    json.NewEncoder(w).Encode(dto)
}

func (h *VaultHandler) handleDelete(w http.ResponseWriter, r *http.Request, id string) {
	if err := h.investmentService.DeleteInvestment(r.Context(), id); err != nil {
		http.Error(w, "Failed to delete vault: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleRefresh recomputes live metrics as of now without mutating the investment
func (h *VaultHandler) handleRefresh(w http.ResponseWriter, r *http.Request, id string) {
    if h.priceService == nil {
        http.Error(w, "price service not available", http.StatusServiceUnavailable)
        return
    }

    // Optional manual override from body or query
    var manualBody struct {
        CurrentValueUSD     *float64 `json:"current_value_usd"`
        CurrentUnitPriceUSD *float64 `json:"current_unit_price_usd"`
        Benchmark           *string  `json:"benchmark"`
        Currency            *string  `json:"currency"`
    }
    // best-effort decode; ignore errors when no body
    _ = json.NewDecoder(r.Body).Decode(&manualBody)
    q := r.URL.Query()
    if manualBody.CurrentValueUSD == nil {
        if v := q.Get("value_usd"); v != "" {
            if f, err := strconv.ParseFloat(v, 64); err == nil {
                manualBody.CurrentValueUSD = &f
            }
        }
    }
    if manualBody.CurrentUnitPriceUSD == nil {
        if v := q.Get("unit_price_usd"); v != "" {
            if f, err := strconv.ParseFloat(v, 64); err == nil {
                manualBody.CurrentUnitPriceUSD = &f
            }
        }
    }
    if manualBody.Currency == nil {
        if v := q.Get("currency"); v != "" {
            manualBody.Currency = &v
        }
    }
    if manualBody.Benchmark == nil {
        if v := q.Get("benchmark"); v != "" {
            manualBody.Benchmark = &v
        }
    }

    inv, err := h.investmentService.GetInvestmentByID(r.Context(), id)
    if err != nil {
        http.Error(w, "Vault not found: "+err.Error(), http.StatusNotFound)
        return
    }
    inv.RealizedPnL = inv.PnL
    inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
    dto := mapInvestmentToVaultDTO(inv)
    if manualBody.CurrentValueUSD != nil || manualBody.CurrentUnitPriceUSD != nil {
        h.enrichVaultWithManualMetrics(r, inv, dto, manualBody)
    } else {
        h.enrichVaultWithLiveMetrics(r, inv, dto)
    }
    json.NewEncoder(w).Encode(dto)
}
