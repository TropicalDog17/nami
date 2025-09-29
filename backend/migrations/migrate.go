package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"

	_ "github.com/lib/pq"
)

// Migration represents a database migration
type Migration struct {
	ID       int
	Filename string
	Content  string
}

func main() {
	// Get database connection string from environment
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5433")
	dbUser := getEnv("DB_USER", "nami_user")
	dbPassword := getEnv("DB_PASSWORD", "nami_password")
	dbName := getEnv("DB_NAME", "nami")
	dbSSLMode := getEnv("DB_SSL_MODE", "disable")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		dbHost, dbPort, dbUser, dbPassword, dbName, dbSSLMode)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	// Create migrations table if it doesn't exist
	if err := createMigrationsTable(db); err != nil {
		log.Fatal("Failed to create migrations table:", err)
	}

	// Get current migration version
	currentVersion, err := getCurrentVersion(db)
	if err != nil {
		log.Fatal("Failed to get current version:", err)
	}

	// Load migrations from files
	migrations, err := loadMigrations()
	if err != nil {
		log.Fatal("Failed to load migrations:", err)
	}

	// Run pending migrations
	for _, migration := range migrations {
		if migration.ID > currentVersion {
			log.Printf("Running migration %d: %s", migration.ID, migration.Filename)
			if err := runMigration(db, migration); err != nil {
				log.Fatalf("Failed to run migration %d: %v", migration.ID, err)
			}
			log.Printf("Migration %d completed successfully", migration.ID)
		}
	}

	log.Println("All migrations completed successfully")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func createMigrationsTable(db *sql.DB) error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			filename VARCHAR(255) NOT NULL,
			executed_at TIMESTAMP DEFAULT NOW()
		)
	`
	_, err := db.Exec(query)
	return err
}

func getCurrentVersion(db *sql.DB) (int, error) {
	var version int
	err := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version)
	return version, err
}

func loadMigrations() ([]Migration, error) {
	var migrations []Migration

	files, err := os.ReadDir(".")
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		// Extract migration ID from filename (e.g., "001_initial_schema.sql" -> 1)
		parts := strings.Split(file.Name(), "_")
		if len(parts) < 2 {
			continue
		}

		id, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}

		content, err := os.ReadFile(file.Name())
		if err != nil {
			return nil, fmt.Errorf("failed to read migration file %s: %v", file.Name(), err)
		}

		migrations = append(migrations, Migration{
			ID:       id,
			Filename: file.Name(),
			Content:  string(content),
		})
	}

	// Sort migrations by ID
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].ID < migrations[j].ID
	})

	return migrations, nil
}

func runMigration(db *sql.DB, migration Migration) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Execute the migration
	if _, err := tx.Exec(migration.Content); err != nil {
		return fmt.Errorf("failed to execute migration: %v", err)
	}

	// Record the migration
	if _, err := tx.Exec(
		"INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)",
		migration.ID, migration.Filename,
	); err != nil {
		return fmt.Errorf("failed to record migration: %v", err)
	}

	return tx.Commit()
}
