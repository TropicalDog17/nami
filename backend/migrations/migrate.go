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

	// Load migrations from files
	migrations, err := loadMigrations()
	if err != nil {
		log.Fatal("Failed to load migrations:", err)
	}

	// Run pending migrations
	for _, migration := range migrations {
		applied, err := isMigrationApplied(db, migration.ID)
		if err != nil {
			log.Fatalf("Failed to check migration %d: %v", migration.ID, err)
		}
		if applied {
			log.Printf("Skipping migration %d (%s): already applied", migration.ID, migration.Filename)
			continue
		}

		if err := runMigration(db, migration); err != nil {
			log.Fatalf("Failed to run migration %d: %v", migration.ID, err)
		}
		log.Printf("Migration %d completed successfully", migration.ID)
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

	// Execute the migration statements one-by-one to allow idempotent re-runs
	statements := splitSQLStatements(migration.Content)
	for _, stmt := range statements {
		if stmt == "" {
			continue
		}
		ls := strings.ToLower(strings.TrimSpace(stmt))
		// Skip transaction control statements inside migration files since we already run in a tx
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

	// Record the migration
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

// splitSQLStatements performs a naive split on ';' and trims whitespace.
// This assumes migrations do not include PL/pgSQL function bodies with embedded semicolons.
func splitSQLStatements(sqlContent string) []string {
	// Strip single-line comments ("-- ...") to avoid spurious tokens
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
	dollarTag := "" // e.g., "" for $$ or "tag" for $tag$

	// helper to check for $tag$ starting/ending
	readDollarTag := func(src string, start int) (tag string, end int, ok bool) {
		// expects src[start] == '$'
		j := start + 1
		for j < len(src) {
			if src[j] == '$' {
				// found closing dollar
				return src[start+1 : j], j, true
			}
			c := src[j]
			if !(c == '_' || c == '-' || c == '.' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
				// not a valid tag char; not a dollar-quote
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
					// entering dollar-quoted block
					inDollar = true
					dollarTag = tag
					// write the opener
					buf.WriteString(s[i : end+1])
					i = end
					continue
				}
			} else {
				// possibly leaving dollar-quoted block
				if tag, end, ok := readDollarTag(s, i); ok && tag == dollarTag {
					// closing tag
					inDollar = false
					dollarTag = ""
					buf.WriteString(s[i : end+1])
					i = end
					continue
				}
			}
		}

		if ch == ';' && !inDollar {
			// end of a statement
			stmt := strings.TrimSpace(buf.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			buf.Reset()
			continue
		}

		buf.WriteByte(ch)
	}

	// final tail
	if tail := strings.TrimSpace(buf.String()); tail != "" {
		statements = append(statements, tail)
	}
	return statements
}

// isIgnorableSQLError returns true for common idempotency-safe errors like
// "already exists" on create or "does not exist" on drop operations.
func isIgnorableSQLError(err error, stmt string) bool {
	e := strings.ToLower(err.Error())
	s := strings.ToLower(strings.TrimSpace(stmt))

	// If creating objects that already exist
	if strings.Contains(e, "already exists") {
		// Only ignore if the statement is a CREATE or ADD
		if strings.HasPrefix(s, "create ") || strings.Contains(s, " add ") {
			return true
		}
	}
	// If dropping objects that do not exist
	if strings.Contains(e, "does not exist") {
		if strings.HasPrefix(s, "drop ") || strings.Contains(s, " drop ") {
			return true
		}
	}
	// If attempting to insert seed rows that already exist via unique constraints
	if strings.Contains(e, "duplicate key value") || strings.Contains(e, "unique constraint") {
		if strings.HasPrefix(s, "insert ") {
			return true
		}
	}
	return false
}
