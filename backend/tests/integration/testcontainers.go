// Package integration provides test utilities for running integration tests
// with testcontainers. These tests require Docker to be running.
//
// Usage:
//
//	Run integration tests with: make test-integration
//	Or directly: cd backend && go test ./tests/integration/
//
// The tests will automatically start PostgreSQL containers, run migrations,
// and clean up after completion.
package integration

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/tropicaldog17/nami/internal/db"
)

// TestContainer holds the PostgreSQL container and connection details
type TestContainer struct {
	Container testcontainers.Container
	DB        *sql.DB
	Config    *db.Config
}

// SetupTestContainer creates and starts a PostgreSQL container for testing
func SetupTestContainer(t *testing.T) *TestContainer {
	t.Helper()

	// Use a longer timeout for container operations
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	// Get the absolute path to the migrations directory
	migrationsPath, err := filepath.Abs("../../migrations")
	if err != nil {
		t.Fatalf("Failed to get absolute path to migrations: %v", err)
	}

	// Start PostgreSQL container
	pgContainer, err := postgres.Run(ctx,
		"postgres:15-alpine",
		postgres.WithDatabase("nami_test"),
		postgres.WithUsername("nami_user"),
		postgres.WithPassword("nami_password"),
		testcontainers.WithWaitStrategy(
			wait.ForListeningPort("5432/tcp").WithStartupTimeout(60),
		),
	)
	if err != nil {
		t.Fatalf("Failed to start PostgreSQL container: %v", err)
	}

	// Get connection details
	host, err := pgContainer.Host(ctx)
	if err != nil {
		t.Fatalf("Failed to get container host: %v", err)
	}

	port, err := pgContainer.MappedPort(ctx, "5432")
	if err != nil {
		t.Fatalf("Failed to get container port: %v", err)
	}

	// Create database config
	config := &db.Config{
		Host:     host,
		Port:     port.Port(),
		User:     "nami_user",
		Password: "nami_password",
		Name:     "nami_test",
		SSLMode:  "disable",
	}

	// Connect to database
	database, err := db.Connect(config)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Run migrations
	if err := runMigrations(database, migrationsPath); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	return &TestContainer{
		Container: pgContainer,
		DB:        database.DB,
		Config:    config,
	}
}

// Cleanup terminates the container and closes the database connection
func (tc *TestContainer) Cleanup(t *testing.T) {
	t.Helper()

	if tc.DB != nil {
		tc.DB.Close()
	}

	if tc.Container != nil {
		if err := tc.Container.Terminate(context.Background()); err != nil {
			t.Logf("Failed to terminate container: %v", err)
		}
	}
}

// runMigrations executes the database migration scripts
func runMigrations(database *db.DB, migrationsPath string) error {
	// Read and execute schema SQL
	schemaPath := filepath.Join(migrationsPath, "001_initial_schema.sql")
	schemaSQL, err := readFile(schemaPath)
	if err != nil {
		return fmt.Errorf("failed to read schema file: %w", err)
	}

	if _, err := database.DB.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	// Read and execute indexes SQL
	indexesPath := filepath.Join(migrationsPath, "002_indexes.sql")
	indexesSQL, err := readFile(indexesPath)
	if err != nil {
		return fmt.Errorf("failed to read indexes file: %w", err)
	}

	if _, err := database.DB.Exec(indexesSQL); err != nil {
		return fmt.Errorf("failed to execute indexes: %w", err)
	}

	// Read and execute seed data SQL
	seedPath := filepath.Join(migrationsPath, "003_seed_data.sql")
	seedSQL, err := readFile(seedPath)
	if err != nil {
		return fmt.Errorf("failed to read seed data file: %w", err)
	}

	if _, err := database.DB.Exec(seedSQL); err != nil {
		return fmt.Errorf("failed to execute seed data: %w", err)
	}

	return nil
}

// readFile reads a file and returns its contents as a string
func readFile(path string) (string, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}
