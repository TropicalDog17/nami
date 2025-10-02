package main

import (
	"database/sql"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	_ "github.com/lib/pq"
)

func main() {
	// Parse command line flags
	dbURL := flag.String("db", os.Getenv("DATABASE_URL"), "Database connection string")
	flag.Parse()

	if *dbURL == "" {
		log.Fatal("Database URL is required. Use -db flag or DATABASE_URL environment variable")
	}

	// Open database connection
	db, err := sql.Open("postgres", *dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Connected to database successfully")

	// Run the investment migration
	if err := runInvestmentMigration(db); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("Investment migration completed successfully!")
}

func runInvestmentMigration(db *sql.DB) error {
	log.Println("Starting investment migration...")

	// Read the migration file
	migrationPath := filepath.Join("migrations", "001_populate_investments.sql")
	migrationSQL, err := fs.ReadFile(os.DirFS("."), migrationPath)
	if err != nil {
		return fmt.Errorf("failed to read migration file %s: %w", migrationPath, err)
	}

	// Check if migration has already been run by looking for investment records
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM investments").Scan(&count)
	if err == nil && count > 0 {
		log.Printf("Found %d existing investment records. Migration may have already been run.", count)

		// Ask for confirmation
		fmt.Print("Do you want to continue and potentially duplicate data? (y/N): ")
		var response string
		fmt.Scanln(&response)
		if response != "y" && response != "Y" {
			log.Println("Migration cancelled by user")
			return nil
		}
	}

	// Begin transaction
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Execute migration
	log.Println("Executing investment migration SQL...")
	_, err = tx.Exec(string(migrationSQL))
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	// Get migration results
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

	log.Printf("Migration completed successfully:")
	log.Printf("- Created %d investment records", investmentCount)
	log.Printf("- Linked %d transactions to investments", transactionCount)

	return nil
}