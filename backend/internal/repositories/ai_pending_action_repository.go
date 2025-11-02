package repositories

import (
    "context"
    "time"

    "github.com/tropicaldog17/nami/internal/db"
    "github.com/tropicaldog17/nami/internal/models"
)

type aiPendingActionRepository struct {
    db *db.DB
}

func NewAIPendingActionRepository(database *db.DB) AIPendingActionRepository {
    return &aiPendingActionRepository{db: database}
}

func (r *aiPendingActionRepository) Create(ctx context.Context, a *models.AIPendingAction) error {
    return r.db.WithContext(ctx).Create(a).Error
}

func (r *aiPendingActionRepository) GetByID(ctx context.Context, id string) (*models.AIPendingAction, error) {
    var a models.AIPendingAction
    if err := r.db.WithContext(ctx).First(&a, "id = ?", id).Error; err != nil {
        return nil, err
    }
    return &a, nil
}

func (r *aiPendingActionRepository) List(ctx context.Context, status string, limit, offset int) ([]*models.AIPendingAction, error) {
    var list []*models.AIPendingAction
    q := r.db.WithContext(ctx).Model(&models.AIPendingAction{})
    if status != "" {
        q = q.Where("status = ?", status)
    }
    if limit > 0 {
        q = q.Limit(limit)
    }
    if offset > 0 {
        q = q.Offset(offset)
    }
    if err := q.Order("created_at DESC").Find(&list).Error; err != nil {
        return nil, err
    }
    return list, nil
}

func (r *aiPendingActionRepository) Update(ctx context.Context, a *models.AIPendingAction) error {
    a.UpdatedAt = time.Now()
    return r.db.WithContext(ctx).Save(a).Error
}

func (r *aiPendingActionRepository) SetAccepted(ctx context.Context, id string, createdTxIDs []string) error {
    return r.db.WithContext(ctx).Model(&models.AIPendingAction{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":          "accepted",
            "created_tx_ids":  createdTxIDs,
            "error":           nil,
            "updated_at":      time.Now(),
        }).Error
}

func (r *aiPendingActionRepository) SetRejected(ctx context.Context, id string, reason string) error {
    return r.db.WithContext(ctx).Model(&models.AIPendingAction{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":     "rejected",
            "error":      reason,
            "updated_at": time.Now(),
        }).Error
}


