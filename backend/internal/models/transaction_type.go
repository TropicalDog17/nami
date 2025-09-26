package models

import (
	"encoding/json"
	"errors"
	"time"
)

// TransactionType represents a configurable transaction type
type TransactionType struct {
	ID          int       `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description *string   `json:"description" db:"description"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// TransactionTypeAudit represents an audit record for transaction type changes
type TransactionTypeAudit struct {
	ID        int             `json:"id" db:"id"`
	TypeID    int             `json:"type_id" db:"type_id"`
	Action    string          `json:"action" db:"action"`
	OldValues json.RawMessage `json:"old_values" db:"old_values"`
	NewValues json.RawMessage `json:"new_values" db:"new_values"`
	ChangedBy string          `json:"changed_by" db:"changed_by"`
	ChangedAt time.Time       `json:"changed_at" db:"changed_at"`
}

// AuditAction constants for transaction type audit
const (
	AuditActionCreate = "CREATE"
	AuditActionUpdate = "UPDATE"
	AuditActionDelete = "DELETE"
)

// Validate validates the transaction type data
func (tt *TransactionType) Validate() error {
	if tt.Name == "" {
		return errors.New("name is required")
	}
	if len(tt.Name) > 50 {
		return errors.New("name must be 50 characters or less")
	}
	return nil
}

// CreateAuditRecord creates an audit record for transaction type changes
func CreateAuditRecord(typeID int, action string, oldValues, newValues interface{}, changedBy string) (*TransactionTypeAudit, error) {
	audit := &TransactionTypeAudit{
		TypeID:    typeID,
		Action:    action,
		ChangedBy: changedBy,
		ChangedAt: time.Now(),
	}

	// Marshal old values if provided
	if oldValues != nil {
		oldJSON, err := json.Marshal(oldValues)
		if err != nil {
			return nil, err
		}
		audit.OldValues = oldJSON
	}

	// Marshal new values if provided
	if newValues != nil {
		newJSON, err := json.Marshal(newValues)
		if err != nil {
			return nil, err
		}
		audit.NewValues = newJSON
	}

	return audit, nil
}

// ValidateAction validates the audit action
func (tta *TransactionTypeAudit) ValidateAction() error {
	switch tta.Action {
	case AuditActionCreate, AuditActionUpdate, AuditActionDelete:
		return nil
	default:
		return errors.New("invalid audit action")
	}
}
