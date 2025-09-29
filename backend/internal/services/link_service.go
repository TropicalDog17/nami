package services

import (
	"context"
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

func (s *linkService) CreateLink(ctx context.Context, link *models.TransactionLink) error {
	if link == nil || link.LinkType == "" || link.FromTx == "" || link.ToTx == "" {
		return fmt.Errorf("invalid link payload")
	}
	query := `INSERT INTO transaction_links (link_type, from_tx, to_tx) VALUES ($1, $2, $3) RETURNING id`
	return s.db.QueryRowContext(ctx, query, link.LinkType, link.FromTx, link.ToTx).Scan(&link.ID)
}

func (s *linkService) GetLinked(ctx context.Context, txID string) ([]*models.TransactionLink, error) {
	query := `SELECT id, link_type, from_tx, to_tx, created_at FROM transaction_links WHERE from_tx = $1 OR to_tx = $1`
	rows, err := s.db.QueryContext(ctx, query, txID)
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
