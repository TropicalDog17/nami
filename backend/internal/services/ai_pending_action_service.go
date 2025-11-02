package services

import (
    "context"
    "encoding/json"
    "fmt"

    "github.com/tropicaldog17/nami/internal/db"
    "github.com/tropicaldog17/nami/internal/models"
    "github.com/tropicaldog17/nami/internal/repositories"
)

type AIPendingService interface {
    Create(ctx context.Context, a *models.AIPendingAction) error
    GetByID(ctx context.Context, id string) (*models.AIPendingAction, error)
    List(ctx context.Context, status string, limit, offset int) ([]*models.AIPendingAction, error)
    Accept(ctx context.Context, id string) (*models.ActionResponse, error)
    Reject(ctx context.Context, id, reason string) error
}

type aiPendingService struct {
    db            *db.DB
    repo          repositories.AIPendingActionRepository
    actionService ActionService
}

func NewAIPendingService(database *db.DB, repo repositories.AIPendingActionRepository, actionService ActionService) AIPendingService {
    return &aiPendingService{db: database, repo: repo, actionService: actionService}
}

func (s *aiPendingService) Create(ctx context.Context, a *models.AIPendingAction) error {
    a.Status = "pending"
    return s.repo.Create(ctx, a)
}

func (s *aiPendingService) GetByID(ctx context.Context, id string) (*models.AIPendingAction, error) {
    return s.repo.GetByID(ctx, id)
}

func (s *aiPendingService) List(ctx context.Context, status string, limit, offset int) ([]*models.AIPendingAction, error) {
    return s.repo.List(ctx, status, limit, offset)
}

func (s *aiPendingService) Accept(ctx context.Context, id string) (*models.ActionResponse, error) {
    a, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if a.Status != "pending" {
        return nil, fmt.Errorf("cannot accept item with status %s", a.Status)
    }
    if len(a.ActionJSON) == 0 {
        return nil, fmt.Errorf("missing action_json to execute")
    }
    var req models.ActionRequest
    if err := json.Unmarshal(a.ActionJSON, &req); err != nil {
        return nil, fmt.Errorf("invalid action_json: %w", err)
    }
    resp, err := s.actionService.Perform(ctx, &req)
    if err != nil {
        return nil, err
    }
    ids := make([]string, 0, len(resp.Transactions))
    for _, t := range resp.Transactions {
        ids = append(ids, t.ID)
    }
    if err := s.repo.SetAccepted(ctx, id, ids); err != nil {
        return nil, err
    }
    return resp, nil
}

func (s *aiPendingService) Reject(ctx context.Context, id, reason string) error {
    return s.repo.SetRejected(ctx, id, reason)
}


