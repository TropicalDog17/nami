package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type ActionHandler struct {
	service services.ActionService
}

func NewActionHandler(service services.ActionService) *ActionHandler {
	return &ActionHandler{service: service}
}

// HandleActions handles POST /api/actions
// @Summary Perform an action
// @Description Perform a domain-specific action
// @Tags actions
// @Accept json
// @Produce json
// @Param action body models.ActionRequest true "Action request"
// @Success 201 {object} models.ActionResponse
// @Failure 400 {string} string "Bad request"
// @Router /actions [post]
func (h *ActionHandler) HandleActions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case "POST":
		var req models.ActionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		resp, err := h.service.Perform(r.Context(), &req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(resp)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
