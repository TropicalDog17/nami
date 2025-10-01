package services

import (
	"context"
	"fmt"
	"time"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// PricePopulationService handles automatic population of historical prices
type PricePopulationService struct {
	db              *db.DB
	genericProvider *GenericPriceProvider
	priceCache      PriceCacheService
}

// NewPricePopulationService creates a new price population service
func NewPricePopulationService(database *db.DB, priceCache PriceCacheService) *PricePopulationService {
	return &PricePopulationService{
		db:              database,
		genericProvider: NewGenericPriceProvider(),
		priceCache:      priceCache,
	}
}

// CreatePopulationJob creates a new job to populate historical prices
func (s *PricePopulationService) CreatePopulationJob(ctx context.Context, assetID, mappingID int, startDate, endDate time.Time) (*models.PricePopulationJob, error) {
	totalDays := int(endDate.Sub(startDate).Hours()/24) + 1

	query := `
		INSERT INTO price_population_jobs (asset_id, mapping_id, status, start_date, end_date, total_days, created_at, updated_at)
		VALUES ($1, $2, 'pending', $3, $4, $5, NOW(), NOW())
		RETURNING id, asset_id, mapping_id, status, start_date, end_date, total_days, completed_days, created_at, updated_at`

	job := &models.PricePopulationJob{}
	err := s.db.QueryRowContext(ctx, query, assetID, mappingID, startDate, endDate, totalDays).Scan(
		&job.ID, &job.AssetID, &job.MappingID, &job.Status, &job.StartDate, &job.EndDate,
		&job.TotalDays, &job.CompletedDays, &job.CreatedAt, &job.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create population job: %w", err)
	}

	return job, nil
}

// PopulatePrices populates historical prices for a given mapping
func (s *PricePopulationService) PopulatePrices(ctx context.Context, jobID int) error {
	// Get job details
	job, err := s.getJob(ctx, jobID)
	if err != nil {
		return fmt.Errorf("failed to get job: %w", err)
	}

	// Get mapping configuration
	mapping, err := s.getMapping(ctx, job.MappingID)
	if err != nil {
		return fmt.Errorf("failed to get mapping: %w", err)
	}

	// Get asset details
	asset, err := s.getAsset(ctx, job.AssetID)
	if err != nil {
		return fmt.Errorf("failed to get asset: %w", err)
	}

	// Update job status to running
	if err := s.updateJobStatus(ctx, jobID, "running", nil); err != nil {
		return err
	}

	// Populate prices day by day
	currentDate := job.StartDate
	completedDays := 0
	var lastError error

	for !currentDate.After(job.EndDate) {
		// Check if price already exists in cache
		cached, _ := s.priceCache.GetCachedPrice(ctx, asset.Symbol, mapping.QuoteCurrency, currentDate)
		if cached == nil {
			// Fetch price using generic provider
			price, err := s.genericProvider.FetchPrice(ctx, mapping, asset.Symbol, mapping.QuoteCurrency, currentDate)
			if err != nil {
				lastError = err
				// Log error but continue with next date
				fmt.Printf("Failed to fetch price for %s on %s: %v\n", asset.Symbol, currentDate.Format("2006-01-02"), err)
			} else {
				// Cache the price
				assetPrice := &models.AssetPrice{
					Symbol:    asset.Symbol,
					Currency:  mapping.QuoteCurrency,
					Price:     price,
					Date:      currentDate,
					Source:    mapping.Provider,
					CreatedAt: time.Now(),
				}
				if err := s.priceCache.CachePrice(ctx, assetPrice); err != nil {
					fmt.Printf("Failed to cache price for %s on %s: %v\n", asset.Symbol, currentDate.Format("2006-01-02"), err)
				}
			}
		}

		completedDays++
		// Update job progress
		if err := s.updateJobProgress(ctx, jobID, currentDate, completedDays); err != nil {
			fmt.Printf("Failed to update job progress: %v\n", err)
		}

		// Move to next day
		currentDate = currentDate.AddDate(0, 0, 1)

		// Rate limiting: small delay between requests
		time.Sleep(100 * time.Millisecond)
	}

	// Update job status to completed or failed
	if lastError != nil {
		errMsg := lastError.Error()
		return s.updateJobStatus(ctx, jobID, "failed", &errMsg)
	}

	// Update last populated date in mapping
	if err := s.updateMappingLastPopulated(ctx, job.MappingID, job.EndDate); err != nil {
		fmt.Printf("Failed to update mapping last populated date: %v\n", err)
	}

	return s.updateJobStatus(ctx, jobID, "completed", nil)
}

// AutoPopulateOnCreate automatically creates and runs a population job when a mapping is created
func (s *PricePopulationService) AutoPopulateOnCreate(ctx context.Context, mapping *models.AssetPriceMapping) error {
	if !mapping.AutoPopulate {
		return nil // Auto-populate not enabled
	}

	startDate := time.Now().AddDate(-1, 0, 0) // Default: 1 year ago
	if mapping.PopulateFromDate != nil {
		startDate = *mapping.PopulateFromDate
	}

	endDate := time.Now()

	// Create job
	job, err := s.CreatePopulationJob(ctx, mapping.AssetID, mapping.ID, startDate, endDate)
	if err != nil {
		return err
	}

	// Run population in background
	go func() {
		bgCtx := context.Background()
		if err := s.PopulatePrices(bgCtx, job.ID); err != nil {
			fmt.Printf("Background price population failed for job %d: %v\n", job.ID, err)
		}
	}()

	return nil
}

// Helper methods

func (s *PricePopulationService) getJob(ctx context.Context, jobID int) (*models.PricePopulationJob, error) {
	query := `SELECT id, asset_id, mapping_id, status, start_date, end_date, total_days, completed_days, created_at, updated_at
	          FROM price_population_jobs WHERE id = $1`

	job := &models.PricePopulationJob{}
	err := s.db.QueryRowContext(ctx, query, jobID).Scan(
		&job.ID, &job.AssetID, &job.MappingID, &job.Status, &job.StartDate, &job.EndDate,
		&job.TotalDays, &job.CompletedDays, &job.CreatedAt, &job.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (s *PricePopulationService) getMapping(ctx context.Context, mappingID int) (*models.AssetPriceMapping, error) {
	query := `SELECT id, asset_id, provider, provider_id, quote_currency, is_popular, 
	                 api_endpoint, api_config, response_path, auto_populate, is_active, created_at
	          FROM asset_price_mappings WHERE id = $1`

	mapping := &models.AssetPriceMapping{}
	err := s.db.QueryRowContext(ctx, query, mappingID).Scan(
		&mapping.ID, &mapping.AssetID, &mapping.Provider, &mapping.ProviderID,
		&mapping.QuoteCurrency, &mapping.IsPopular, &mapping.APIEndpoint, &mapping.APIConfig,
		&mapping.ResponsePath, &mapping.AutoPopulate, &mapping.IsActive, &mapping.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return mapping, nil
}

func (s *PricePopulationService) getAsset(ctx context.Context, assetID int) (*models.Asset, error) {
	query := `SELECT id, symbol, name, decimals, is_active, created_at FROM assets WHERE id = $1`

	asset := &models.Asset{}
	err := s.db.QueryRowContext(ctx, query, assetID).Scan(
		&asset.ID, &asset.Symbol, &asset.Name, &asset.Decimals, &asset.IsActive, &asset.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return asset, nil
}

func (s *PricePopulationService) updateJobStatus(ctx context.Context, jobID int, status string, errorMsg *string) error {
	now := time.Now()
	var query string
	var args []interface{}

	if status == "running" {
		query = `UPDATE price_population_jobs SET status = $1, started_at = $2, updated_at = $3 WHERE id = $4`
		args = []interface{}{status, now, now, jobID}
	} else if status == "completed" || status == "failed" {
		query = `UPDATE price_population_jobs SET status = $1, completed_at = $2, error_message = $3, updated_at = $4 WHERE id = $5`
		args = []interface{}{status, now, errorMsg, now, jobID}
	} else {
		query = `UPDATE price_population_jobs SET status = $1, updated_at = $2 WHERE id = $3`
		args = []interface{}{status, now, jobID}
	}

	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *PricePopulationService) updateJobProgress(ctx context.Context, jobID int, currentDate time.Time, completedDays int) error {
	query := `UPDATE price_population_jobs SET current_date = $1, completed_days = $2, updated_at = $3 WHERE id = $4`
	_, err := s.db.ExecContext(ctx, query, currentDate, completedDays, time.Now(), jobID)
	return err
}

func (s *PricePopulationService) updateMappingLastPopulated(ctx context.Context, mappingID int, date time.Time) error {
	query := `UPDATE asset_price_mappings SET last_populated_date = $1 WHERE id = $2`
	_, err := s.db.ExecContext(ctx, query, date, mappingID)
	return err
}

// GetJobStatus returns the current status of a population job
func (s *PricePopulationService) GetJobStatus(ctx context.Context, jobID int) (*models.PricePopulationJob, error) {
	return s.getJob(ctx, jobID)
}

// ListJobs returns all population jobs for an asset
func (s *PricePopulationService) ListJobs(ctx context.Context, assetID int) ([]*models.PricePopulationJob, error) {
	query := `SELECT id, asset_id, mapping_id, status, start_date, end_date, current_date, 
	                 total_days, completed_days, error_message, created_at, started_at, completed_at, updated_at
	          FROM price_population_jobs 
	          WHERE asset_id = $1 
	          ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*models.PricePopulationJob
	for rows.Next() {
		job := &models.PricePopulationJob{}
		err := rows.Scan(
			&job.ID, &job.AssetID, &job.MappingID, &job.Status, &job.StartDate, &job.EndDate,
			&job.CurrentDate, &job.TotalDays, &job.CompletedDays, &job.ErrorMessage,
			&job.CreatedAt, &job.StartedAt, &job.CompletedAt, &job.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, nil
}
