package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/tropicaldog17/nami/internal/services"
)

type PricePopulationHandler struct {
	service *services.PricePopulationService
}

func NewPricePopulationHandler(service *services.PricePopulationService) *PricePopulationHandler {
	return &PricePopulationHandler{service: service}
}

// HandleCreateJob creates a new price population job
// POST /api/admin/price-population/jobs
func (h *PricePopulationHandler) HandleCreateJob(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		AssetID   int    `json:"asset_id"`
		MappingID int    `json:"mapping_id"`
		StartDate string `json:"start_date"` // YYYY-MM-DD
		EndDate   string `json:"end_date"`   // YYYY-MM-DD
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Parse dates
	startDate, err := time.Parse("2006-01-02", payload.StartDate)
	if err != nil {
		http.Error(w, "Invalid start_date format, use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	endDate, err := time.Parse("2006-01-02", payload.EndDate)
	if err != nil {
		http.Error(w, "Invalid end_date format, use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Create job
	job, err := h.service.CreatePopulationJob(r.Context(), payload.AssetID, payload.MappingID, startDate, endDate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Start population in background
	go func() {
		if err := h.service.PopulatePrices(r.Context(), job.ID); err != nil {
			// Log error (in production, use proper logging)
			println("Price population failed:", err.Error())
		}
	}()

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(job)
}

// HandleGetJobStatus gets the status of a price population job
// GET /api/admin/price-population/jobs/{id}
func (h *PricePopulationHandler) HandleGetJobStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract job ID from URL (assuming it's passed as query param or path)
	jobIDStr := r.URL.Query().Get("id")
	if jobIDStr == "" {
		http.Error(w, "job id is required", http.StatusBadRequest)
		return
	}

	jobID, err := strconv.Atoi(jobIDStr)
	if err != nil {
		http.Error(w, "Invalid job id", http.StatusBadRequest)
		return
	}

	job, err := h.service.GetJobStatus(r.Context(), jobID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(job)
}

// HandleListJobs lists all price population jobs for an asset
// GET /api/admin/price-population/jobs?asset_id={id}
func (h *PricePopulationHandler) HandleListJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	assetIDStr := r.URL.Query().Get("asset_id")
	if assetIDStr == "" {
		http.Error(w, "asset_id is required", http.StatusBadRequest)
		return
	}

	assetID, err := strconv.Atoi(assetIDStr)
	if err != nil {
		http.Error(w, "Invalid asset_id", http.StatusBadRequest)
		return
	}

	jobs, err := h.service.ListJobs(r.Context(), assetID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(jobs)
}

// HandleTriggerPopulation manually triggers price population for a mapping
// POST /api/admin/price-population/trigger
func (h *PricePopulationHandler) HandleTriggerPopulation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		MappingID int    `json:"mapping_id"`
		StartDate string `json:"start_date,omitempty"` // Optional, defaults to populate_from_date
		EndDate   string `json:"end_date,omitempty"`   // Optional, defaults to today
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Get mapping to determine asset_id and default dates
	// For now, require explicit dates
	if payload.StartDate == "" || payload.EndDate == "" {
		http.Error(w, "start_date and end_date are required", http.StatusBadRequest)
		return
	}

	_, err := time.Parse("2006-01-02", payload.StartDate)
	if err != nil {
		http.Error(w, "Invalid start_date format", http.StatusBadRequest)
		return
	}

	_, err = time.Parse("2006-01-02", payload.EndDate)
	if err != nil {
		http.Error(w, "Invalid end_date format", http.StatusBadRequest)
		return
	}

	// Get asset_id from mapping (simplified - in production, query the mapping)
	// For now, return error asking for asset_id
	http.Error(w, "Not implemented - use /jobs endpoint with asset_id", http.StatusNotImplemented)
	return

	// When implemented:
	// job, err := h.service.CreatePopulationJob(r.Context(), assetID, payload.MappingID, startDate, endDate)
	// ...
}
