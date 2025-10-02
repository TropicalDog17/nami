package integration

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/tropicaldog17/nami/internal/db"
	gormPostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type testDB struct {
	container testcontainers.Container
	database  *db.DB
}

func setupTestDB(t *testing.T) *testDB {
	if testing.Short() {
		t.Skip("skipping container-based DB tests in short mode")
	}
	ctx := context.Background()

	// Start PostgreSQL container
	pgContainer, err := postgres.Run(ctx,
		"postgres:15-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("testuser"),
		postgres.WithPassword("testpass"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(5*time.Second)),
	)
	if err != nil {
		t.Fatalf("Failed to start PostgreSQL container: %v", err)
	}

	// Get connection string
	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("Failed to get connection string: %v", err)
	}

	// Create database wrapper using GORM
	database, err := gorm.Open(gormPostgres.New(gormPostgres.Config{
		DSN:                  connStr,
		PreferSimpleProtocol: true, // disables implicit prepared statement usage
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	// Create tables
	if err := setupTestTables(&db.DB{
		DB: database,
	}); err != nil {
		t.Fatalf("Failed to setup test tables: %v", err)
	}

	return &testDB{
		container: pgContainer,
		database:  &db.DB{DB: database},
	}
}

func (tdb *testDB) cleanup(t *testing.T) {
	ctx := context.Background()
	if err := tdb.container.Terminate(ctx); err != nil {
		t.Errorf("Failed to terminate container: %v", err)
	}
}

func setupTestTables(database *db.DB) error {
	// Locate migrations directory robustly
	// 1) Allow override via MIGRATIONS_DIR
	// 2) Search upwards from current working directory for a folder containing backend/migrations
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		// Start with the current working directory and move up a few levels
		wd, _ := os.Getwd()
		dir := wd
		for i := 0; i < 8; i++ {
			candidate := filepath.Join(dir, "backend", "migrations")
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				migrationsDir = candidate
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
		// As a last resort, try the relative path from the repo root assumption
		if migrationsDir == "" {
			candidate := filepath.Join("backend", "migrations")
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				migrationsDir = candidate
			}
		}
	}
	if migrationsDir == "" {
		return fmt.Errorf("failed to locate migrations directory; set MIGRATIONS_DIR or run tests from repo root")
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return err
	}
	// Sort by filename to ensure correct order
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		b, rerr := os.ReadFile(filepath.Join(migrationsDir, e.Name()))
		if rerr != nil {
			return rerr
		}
		sqlText := string(b)
		// Get underlying SQL DB for migration execution
		sqlDB, err := database.GetSQLDB()
		if err != nil {
			return fmt.Errorf("failed to get SQL DB: %w", err)
		}
		// Execute the entire file content at once to preserve dollar-quoted blocks
		if _, exErr := sqlDB.Exec(sqlText); exErr != nil {
			return exErr
		}
	}
	return nil
}
