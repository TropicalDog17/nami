package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

func main() {
	// Parse command line flags
	migrate := flag.Bool("migrate", false, "Run data migration")
	flag.Parse()

	// Initialize database connection
	config := db.NewConfig()
	dbConn, err := db.Connect(config)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer dbConn.Close()

	if *migrate {
		log.Println("Running investment migration...")
		if err := runInvestmentMigration(dbConn); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		log.Println("Migration completed successfully!")
	}

	// Test the investment system
	log.Println("Testing investment system...")
	if err := testInvestmentSystem(dbConn); err != nil {
		log.Fatalf("Investment system test failed: %v", err)
	}

	log.Println("Investment system test passed!")
}

func runInvestmentMigration(db *db.DB) error {
	// Read the migration file
	migrationSQL := `
-- Create investment records from existing transaction data
INSERT INTO investments (
    id,
    asset,
    account,
    horizon,
    deposit_date,
    deposit_qty,
    deposit_cost,
    deposit_unit_cost,
    withdrawal_qty,
    withdrawal_value,
    withdrawal_unit_price,
    pnl,
    pnl_percent,
    is_open,
    remaining_qty,
    cost_basis_method,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() as id,
    t.asset,
    t.account,
    CASE WHEN t.horizon = '' THEN NULL ELSE t.horizon END as horizon,
    MIN(t.date) as deposit_date,
    COALESCE(SUM(t.quantity), 0) as deposit_qty,
    COALESCE(SUM(t.amount_usd), 0) as deposit_cost,
    CASE
        WHEN SUM(t.quantity) > 0 THEN SUM(t.amount_usd) / SUM(t.quantity)
        ELSE 0
    END as deposit_unit_cost,
    0 as withdrawal_qty,
    0 as withdrawal_value,
    0 as withdrawal_unit_price,
    0 as pnl,
    0 as pnl_percent,
    TRUE as is_open,
    COALESCE(SUM(t.quantity), 0) as remaining_qty,
    'fifo' as cost_basis_method,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM transactions t
WHERE t.type = 'stake'
  AND t.asset IS NOT NULL
  AND t.account IS NOT NULL
GROUP BY t.asset, t.account, t.horizon
HAVING COALESCE(SUM(t.quantity), 0) > 0
ON CONFLICT DO NOTHING;

-- Link transactions to investments
UPDATE transactions t SET
    investment_id = i.id
FROM investments i
WHERE t.asset = i.asset
  AND t.account = i.account
  AND (t.horizon = i.horizon OR (t.horizon IS NULL AND i.horizon IS NULL))
  AND t.investment_id IS NULL;
`

	// Begin transaction
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Execute migration
	_, err = tx.Exec(migrationSQL)
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	// Get results
	var investmentCount, transactionCount int
	err = tx.QueryRow("SELECT COUNT(*) FROM investments").Scan(&investmentCount)
	if err != nil {
		return fmt.Errorf("failed to count investments: %w", err)
	}

	err = tx.QueryRow("SELECT COUNT(*) FROM transactions WHERE investment_id IS NOT NULL").Scan(&transactionCount)
	if err != nil {
		return fmt.Errorf("failed to count linked transactions: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit migration: %w", err)
	}

	log.Printf("Migration completed:")
	log.Printf("- Created %d investment records", investmentCount)
	log.Printf("- Linked %d transactions to investments", transactionCount)

	return nil
}

func testInvestmentSystem(db *db.DB) error {
	ctx := context.Background()

	// Create repositories
	investmentRepo := repositories.NewInvestmentRepository(db)

	// Create services
	reportingService := services.NewReportingService(db)

	// Test investment listing
	investments, err := investmentRepo.List(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to list investments: %w", err)
	}

	log.Printf("Found %d investments", len(investments))

	// Test investment summary
	summary, err := investmentRepo.GetSummary(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to get investment summary: %w", err)
	}

	log.Printf("Investment summary: %+v", summary)

	// Test P&L calculation (using a default period)
	startDate, _ := time.Parse("2006-01-02", "2025-01-01")
	endDate, _ := time.Parse("2006-01-02", "2025-12-31")
	period := models.Period{
		StartDate: startDate,
		EndDate:   endDate,
	}

	pnl, err := reportingService.GetPnL(ctx, period)
	if err != nil {
		return fmt.Errorf("failed to get P&L: %w", err)
	}

	log.Printf("P&L Report:")
	log.Printf("- Realized P&L (USD): %s", pnl.RealizedPnLUSD.String())
	log.Printf("- Unrealized P&L (USD): %s", pnl.UnrealizedPnLUSD.String())
	log.Printf("- ROI: %s%%", pnl.ROIPercent.String())

	return nil
}