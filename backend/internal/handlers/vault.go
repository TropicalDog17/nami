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
}

func NewVaultHandler(investmentService services.InvestmentService) *VaultHandler {
	return &VaultHandler{investmentService: investmentService}
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
		// Accept any payload and acknowledge creation; actual investments are created via deposits
		var payload map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
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
		json.NewEncoder(w).Encode(mapInvestmentToVaultDTO(inv))
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
		default:
			http.Error(w, "Unknown action", http.StatusNotFound)
			return
		}
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
	if body.Quantity > 0 {
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
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(mapInvestmentToVaultDTO(updated))
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
	if body.Quantity > 0 {
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
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(mapInvestmentToVaultDTO(updated))
}

func (h *VaultHandler) handleEnd(w http.ResponseWriter, r *http.Request, id string) {
	updated, err := h.investmentService.CloseInvestment(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to end vault: "+err.Error(), http.StatusBadRequest)
		return
	}
	updated.RealizedPnL = updated.PnL
	updated.RemainingQty = updated.DepositQty.Sub(updated.WithdrawalQty)
	json.NewEncoder(w).Encode(mapInvestmentToVaultDTO(updated))
}
