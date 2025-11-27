package integration

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
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

// --- Migration Logic (adapted from backend/migrations/migrate.go) ---

// Migration represents a database migration
type Migration struct {
	ID       int
	Filename string
	Content  string
}

func setupTestTables(database *db.DB) error {
	sqlDB, err := database.GetSQLDB()
	if err != nil {
		return fmt.Errorf("failed to get SQL DB: %w", err)
	}

	// Create migrations table if it doesn't exist
	if err := createMigrationsTable(sqlDB); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Load migrations from files
	migrations, err := loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	// Run pending migrations
	for _, migration := range migrations {
		applied, err := isMigrationApplied(sqlDB, migration.ID)
		if err != nil {
			return fmt.Errorf("failed to check migration %d: %v", migration.ID, err)
		}
		if applied {
			continue
		}

		if err := runMigration(sqlDB, migration); err != nil {
			return fmt.Errorf("failed to run migration %d (%s): %v", migration.ID, migration.Filename, err)
		}
	}

	return nil
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

func loadMigrations() ([]Migration, error) {
	var migrations []Migration

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		wd, _ := os.Getwd()
		dir := wd
		for i := 0; i < 8; i++ {
			candidate := filepath.Join(dir, "..", "migrations")
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
	}
	if migrationsDir == "" {
		return nil, fmt.Errorf("failed to locate migrations directory; set MIGRATIONS_DIR or run tests from repo root")
	}

	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		parts := strings.Split(file.Name(), "_")
		if len(parts) < 2 {
			continue
		}

		id, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, file.Name()))
		if err != nil {
			return nil, fmt.Errorf("failed to read migration file %s: %v", file.Name(), err)
		}

		migrations = append(migrations, Migration{
			ID:       id,
			Filename: file.Name(),
			Content:  string(content),
		})
	}

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

	statements := splitSQLStatements(migration.Content)
	for _, stmt := range statements {
		if stmt == "" {
			continue
		}
		ls := strings.ToLower(strings.TrimSpace(stmt))
		if ls == "begin" || ls == "commit" || ls == "rollback" || ls == "start transaction" {
			continue
		}
		if _, err := tx.Exec(stmt); err != nil {
			if isIgnorableSQLError(err, stmt) {
				log.Printf("Ignoring benign error for idempotency: %v", err)
				continue
			}
			return fmt.Errorf("failed to execute migration statement: %v", err)
		}
	}

	if _, err := tx.Exec(
		"INSERT INTO schema_migrations (version, filename) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
		migration.ID, migration.Filename,
	); err != nil {
		return fmt.Errorf("failed to record migration: %v", err)
	}

	return tx.Commit()
}

func isMigrationApplied(db *sql.DB, id int) (bool, error) {
	var exists bool
	err := db.QueryRow("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", id).Scan(&exists)
	return exists, err
}

func splitSQLStatements(sqlContent string) []string {
	var pre strings.Builder
	for _, line := range strings.Split(sqlContent, "\n") {
		trimmed := line
		if idx := strings.Index(trimmed, "--"); idx >= 0 {
			trimmed = trimmed[:idx]
		}
		pre.WriteString(trimmed)
		pre.WriteString("\n")
	}

	s := pre.String()
	statements := make([]string, 0)
	var buf strings.Builder

	inDollar := false
	dollarTag := ""

	readDollarTag := func(src string, start int) (tag string, end int, ok bool) {
		j := start + 1
		for j < len(src) {
			if src[j] == '$' {
				return src[start+1 : j], j, true
			}
			c := src[j]
			if !(c == '_' || c == '-' || c == '.' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
				return "", start, false
			}
			j++
		}
		return "", start, false
	}

	for i := 0; i < len(s); i++ {
		ch := s[i]

		if ch == '$' {
			if !inDollar {
				if tag, end, ok := readDollarTag(s, i); ok {
					inDollar = true
					dollarTag = tag
					buf.WriteString(s[i : end+1])
					i = end
					continue
				}
			} else {
				if tag, end, ok := readDollarTag(s, i); ok && tag == dollarTag {
					inDollar = false
					dollarTag = ""
					buf.WriteString(s[i : end+1])
					i = end
					continue
				}
			}
		}

		if ch == ';' && !inDollar {
			stmt := strings.TrimSpace(buf.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			buf.Reset()
			continue
		}

		buf.WriteByte(ch)
	}

	if tail := strings.TrimSpace(buf.String()); tail != "" {
		statements = append(statements, tail)
	}
	return statements
}

func isIgnorableSQLError(err error, stmt string) bool {
	e := strings.ToLower(err.Error())
	s := strings.ToLower(strings.TrimSpace(stmt))

	if strings.Contains(e, "already exists") {
		if strings.HasPrefix(s, "create ") || strings.Contains(s, " add ") {
			return true
		}
	}
	if strings.Contains(e, "does not exist") {
		if strings.HasPrefix(s, "drop ") || strings.Contains(s, " drop ") {
			return true
		}
	}
	if strings.Contains(e, "duplicate key value") || strings.Contains(e, "unique constraint") {
		if strings.HasPrefix(s, "insert ") {
			return true
		}
	}
	return false
}

// --- End of Migration Logic ---

// Common helper functions for integration tests

func makeStakeTx(date time.Time, asset, account string, qty, priceUSD float64) *models.Transaction {
	return &models.Transaction{
		Date:          date,
		Type:          models.ActionStake,
		Asset:         asset,
		Account:       account,
		Quantity:      decimal.NewFromFloat(qty),
		PriceLocal:    decimal.NewFromFloat(priceUSD),
		LocalCurrency: "USD",
		FeeLocal:      decimal.Zero,
	}
}

func getDecimal(v interface{}) decimal.Decimal {
	switch x := v.(type) {
	case string:
		if x == "" {
			return decimal.Zero
		}
		if d, err := decimal.NewFromString(x); err == nil {
			return d
		}
		if f, err := strconv.ParseFloat(x, 64); err == nil {
			return decimal.NewFromFloat(f)
		}
		return decimal.Zero
	case float64:
		return decimal.NewFromFloat(x)
	case json.Number:
		if f, err := x.Float64(); err == nil {
			return decimal.NewFromFloat(f)
		}
		return decimal.Zero
	default:
		return decimal.Zero
	}
}

type mockAssetPriceService struct {
	price decimal.Decimal
}

func (m *mockAssetPriceService) GetDaily(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
	return &models.AssetPrice{
		Symbol:   symbol,
		Currency: currency,
		Price:    m.price,
		Date:     date,
	}, nil
}

func (m *mockAssetPriceService) GetRange(ctx context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error) {
	res := make([]*models.AssetPrice, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		res = append(res, &models.AssetPrice{
			Symbol:   symbol,
			Currency: currency,
			Price:    m.price,
			Date:     d,
		})
	}
	return res, nil
}

func (m *mockAssetPriceService) GetLatest(ctx context.Context, symbol, currency string) (*models.AssetPrice, error) {
	return &models.AssetPrice{
		Symbol:    symbol,
		Currency:  currency,
		Price:     m.price,
		Date:      time.Now(),
		Source:    "coingecko",
		CreatedAt: time.Now(),
	}, nil
}

// Shared pointer helpers for tests
func stringPtr(s string) *string     { return &s }
func boolPtr(b bool) *bool           { return &b }
func timePtr(t time.Time) *time.Time { return &t }
func floatPtr(f float64) *float64    { return &f }

func assertApproxEqual(t *testing.T, a, b decimal.Decimal, toleranceBPS int64) {
	diff := a.Sub(b).Abs()
	tol := a.Mul(decimal.NewFromInt(toleranceBPS)).Div(decimal.NewFromInt(10000)).Abs()
	if diff.GreaterThan(tol) {
		t.Errorf("Values not approximately equal: %s vs %s (diff: %s > tol: %s)", a.String(), b.String(), diff.String(), tol.String())
	}
}
