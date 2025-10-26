package services

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

type linkService struct {
	db *db.DB
}

func NewLinkService(database *db.DB) LinkService {
	return &linkService{db: database}
}

// getSQLDB returns the underlying *sql.DB for complex queries
func (s *linkService) getSQLDB() (*sql.DB, error) {
	return s.db.GetSQLDB()
}

func (s *linkService) CreateLink(ctx context.Context, link *models.TransactionLink) error {
	if link == nil || link.LinkType == "" || link.FromTx == "" || link.ToTx == "" {
		return fmt.Errorf("invalid link payload")
	}
	sqlDB, err := s.getSQLDB()
	if err != nil {
		return fmt.Errorf("failed to get SQL DB: %w", err)
	}
	// Ensure table exists before attempting to insert to avoid runtime failures in forward-compat scenarios
	var hasLinks bool
	if err := sqlDB.QueryRowContext(ctx, "SELECT to_regclass('public.transaction_links') IS NOT NULL").Scan(&hasLinks); err != nil {
		hasLinks = false
	}
	if !hasLinks {
		return fmt.Errorf("transaction_links table not available")
	}
	query := `INSERT INTO transaction_links (link_type, from_tx, to_tx) VALUES ($1, $2, $3) RETURNING id`
	return sqlDB.QueryRowContext(ctx, query, link.LinkType, link.FromTx, link.ToTx).Scan(&link.ID)
}

func (s *linkService) GetLinked(ctx context.Context, txID string) ([]*models.TransactionLink, error) {
	sqlDB, err := s.getSQLDB()
	if err != nil {
		return nil, fmt.Errorf("failed to get SQL DB: %w", err)
	}
	// If links table is missing, return empty result gracefully
	var hasLinks bool
	if err := sqlDB.QueryRowContext(ctx, "SELECT to_regclass('public.transaction_links') IS NOT NULL").Scan(&hasLinks); err != nil {
		hasLinks = false
	}
	if !hasLinks {
		return []*models.TransactionLink{}, nil
	}
	query := `SELECT id, link_type, from_tx, to_tx, created_at FROM transaction_links WHERE from_tx = $1 OR to_tx = $1`
	rows, err := sqlDB.QueryContext(ctx, query, txID)
	if err != nil {
		return nil, fmt.Errorf("failed to query links: %w", err)
	}
	defer rows.Close()
	var links []*models.TransactionLink
	for rows.Next() {
		l := &models.TransactionLink{}
		if err := rows.Scan(&l.ID, &l.LinkType, &l.FromTx, &l.ToTx, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan link: %w", err)
		}
		links = append(links, l)
	}
	return links, nil
}
