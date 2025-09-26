package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/models"
)

// adminService implements the AdminService interface
type adminService struct {
	db *db.DB
}

// NewAdminService creates a new admin service
func NewAdminService(database *db.DB) AdminService {
	return &adminService{
		db: database,
	}
}

// Transaction Types methods

// ListTransactionTypes retrieves all transaction types
func (s *adminService) ListTransactionTypes(ctx context.Context) ([]*models.TransactionType, error) {
	query := `
		SELECT id, name, description, is_active, created_at, updated_at
		FROM transaction_types
		ORDER BY name`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list transaction types: %w", err)
	}
	defer rows.Close()

	var types []*models.TransactionType
	for rows.Next() {
		tt := &models.TransactionType{}
		err := rows.Scan(&tt.ID, &tt.Name, &tt.Description, &tt.IsActive, &tt.CreatedAt, &tt.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan transaction type: %w", err)
		}
		types = append(types, tt)
	}

	return types, nil
}

// GetTransactionType retrieves a transaction type by ID
func (s *adminService) GetTransactionType(ctx context.Context, id int) (*models.TransactionType, error) {
	query := `
		SELECT id, name, description, is_active, created_at, updated_at
		FROM transaction_types
		WHERE id = $1`

	tt := &models.TransactionType{}
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&tt.ID, &tt.Name, &tt.Description, &tt.IsActive, &tt.CreatedAt, &tt.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("transaction type not found: %d", id)
		}
		return nil, fmt.Errorf("failed to get transaction type: %w", err)
	}

	return tt, nil
}

// CreateTransactionType creates a new transaction type with audit trail
func (s *adminService) CreateTransactionType(ctx context.Context, tt *models.TransactionType, changedBy string) error {
	if err := tt.Validate(); err != nil {
		return fmt.Errorf("transaction type validation failed: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Set timestamps
	now := time.Now()
	tt.CreatedAt = now
	tt.UpdatedAt = now

	// Insert transaction type
	query := `
		INSERT INTO transaction_types (name, description, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`

	err = tx.QueryRowContext(ctx, query, tt.Name, tt.Description, tt.IsActive, tt.CreatedAt, tt.UpdatedAt).Scan(&tt.ID)
	if err != nil {
		return fmt.Errorf("failed to create transaction type: %w", err)
	}

	// Create audit record
	audit, err := models.CreateAuditRecord(tt.ID, models.AuditActionCreate, nil, tt, changedBy)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	auditQuery := `
		INSERT INTO transaction_type_audit (type_id, action, old_values, new_values, changed_by, changed_at)
		VALUES ($1, $2, $3, $4, $5, $6)`

	_, err = tx.ExecContext(ctx, auditQuery, audit.TypeID, audit.Action, audit.OldValues, audit.NewValues, audit.ChangedBy, audit.ChangedAt)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	return tx.Commit()
}

// UpdateTransactionType updates a transaction type with audit trail
func (s *adminService) UpdateTransactionType(ctx context.Context, tt *models.TransactionType, changedBy string) error {
	if err := tt.Validate(); err != nil {
		return fmt.Errorf("transaction type validation failed: %w", err)
	}

	// Get old values for audit
	oldType, err := s.GetTransactionType(ctx, tt.ID)
	if err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Update timestamp
	tt.UpdatedAt = time.Now()

	// Update transaction type
	query := `
		UPDATE transaction_types SET
			name = $2, description = $3, is_active = $4, updated_at = $5
		WHERE id = $1`

	result, err := tx.ExecContext(ctx, query, tt.ID, tt.Name, tt.Description, tt.IsActive, tt.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update transaction type: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("transaction type not found: %d", tt.ID)
	}

	// Create audit record
	audit, err := models.CreateAuditRecord(tt.ID, models.AuditActionUpdate, oldType, tt, changedBy)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	auditQuery := `
		INSERT INTO transaction_type_audit (type_id, action, old_values, new_values, changed_by, changed_at)
		VALUES ($1, $2, $3, $4, $5, $6)`

	_, err = tx.ExecContext(ctx, auditQuery, audit.TypeID, audit.Action, audit.OldValues, audit.NewValues, audit.ChangedBy, audit.ChangedAt)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	return tx.Commit()
}

// DeleteTransactionType soft deletes a transaction type with audit trail
func (s *adminService) DeleteTransactionType(ctx context.Context, id int, changedBy string) error {
	// Get old values for audit
	oldType, err := s.GetTransactionType(ctx, id)
	if err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Soft delete (set is_active to false)
	query := `
		UPDATE transaction_types SET
			is_active = false, updated_at = $2
		WHERE id = $1`

	result, err := tx.ExecContext(ctx, query, id, time.Now())
	if err != nil {
		return fmt.Errorf("failed to delete transaction type: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("transaction type not found: %d", id)
	}

	// Create audit record
	audit, err := models.CreateAuditRecord(id, models.AuditActionDelete, oldType, nil, changedBy)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	auditQuery := `
		INSERT INTO transaction_type_audit (type_id, action, old_values, new_values, changed_by, changed_at)
		VALUES ($1, $2, $3, $4, $5, $6)`

	_, err = tx.ExecContext(ctx, auditQuery, audit.TypeID, audit.Action, audit.OldValues, audit.NewValues, audit.ChangedBy, audit.ChangedAt)
	if err != nil {
		return fmt.Errorf("failed to create audit record: %w", err)
	}

	return tx.Commit()
}

// GetTypeAuditTrail retrieves the audit trail for a transaction type
func (s *adminService) GetTypeAuditTrail(ctx context.Context, typeID int) ([]*models.TransactionTypeAudit, error) {
	query := `
		SELECT id, type_id, action, old_values, new_values, changed_by, changed_at
		FROM transaction_type_audit
		WHERE type_id = $1
		ORDER BY changed_at DESC`

	rows, err := s.db.QueryContext(ctx, query, typeID)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit trail: %w", err)
	}
	defer rows.Close()

	var audits []*models.TransactionTypeAudit
	for rows.Next() {
		audit := &models.TransactionTypeAudit{}
		err := rows.Scan(&audit.ID, &audit.TypeID, &audit.Action, &audit.OldValues, &audit.NewValues, &audit.ChangedBy, &audit.ChangedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan audit record: %w", err)
		}
		audits = append(audits, audit)
	}

	return audits, nil
}

// Account methods

// ListAccounts retrieves all accounts
func (s *adminService) ListAccounts(ctx context.Context) ([]*models.Account, error) {
	query := `
		SELECT id, name, type, is_active, created_at
		FROM accounts
		WHERE is_active = true
		ORDER BY name`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}
	defer rows.Close()

	var accounts []*models.Account
	for rows.Next() {
		account := &models.Account{}
		err := rows.Scan(&account.ID, &account.Name, &account.Type, &account.IsActive, &account.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan account: %w", err)
		}
		accounts = append(accounts, account)
	}

	return accounts, nil
}

// GetAccount retrieves an account by ID
func (s *adminService) GetAccount(ctx context.Context, id int) (*models.Account, error) {
	query := `
		SELECT id, name, type, is_active, created_at
		FROM accounts
		WHERE id = $1`

	account := &models.Account{}
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&account.ID, &account.Name, &account.Type, &account.IsActive, &account.CreatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("account not found: %d", id)
		}
		return nil, fmt.Errorf("failed to get account: %w", err)
	}

	return account, nil
}

// CreateAccount creates a new account
func (s *adminService) CreateAccount(ctx context.Context, account *models.Account) error {
	if err := account.Validate(); err != nil {
		return fmt.Errorf("account validation failed: %w", err)
	}

	account.CreatedAt = time.Now()

	query := `
		INSERT INTO accounts (name, type, is_active, created_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id`

	err := s.db.QueryRowContext(ctx, query, account.Name, account.Type, account.IsActive, account.CreatedAt).Scan(&account.ID)
	if err != nil {
		return fmt.Errorf("failed to create account: %w", err)
	}

	return nil
}

// UpdateAccount updates an existing account
func (s *adminService) UpdateAccount(ctx context.Context, account *models.Account) error {
	if err := account.Validate(); err != nil {
		return fmt.Errorf("account validation failed: %w", err)
	}

	query := `
		UPDATE accounts SET
			name = $2, type = $3, is_active = $4
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, account.ID, account.Name, account.Type, account.IsActive)
	if err != nil {
		return fmt.Errorf("failed to update account: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("account not found: %d", account.ID)
	}

	return nil
}

// DeleteAccount soft deletes an account
func (s *adminService) DeleteAccount(ctx context.Context, id int) error {
	query := `
		UPDATE accounts SET is_active = false
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete account: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("account not found: %d", id)
	}

	return nil
}

// Asset methods

// ListAssets retrieves all assets
func (s *adminService) ListAssets(ctx context.Context) ([]*models.Asset, error) {
	query := `
		SELECT id, symbol, name, decimals, is_active, created_at
		FROM assets
		WHERE is_active = true
		ORDER BY symbol`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list assets: %w", err)
	}
	defer rows.Close()

	var assets []*models.Asset
	for rows.Next() {
		asset := &models.Asset{}
		err := rows.Scan(&asset.ID, &asset.Symbol, &asset.Name, &asset.Decimals, &asset.IsActive, &asset.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan asset: %w", err)
		}
		assets = append(assets, asset)
	}

	return assets, nil
}

// GetAsset retrieves an asset by ID
func (s *adminService) GetAsset(ctx context.Context, id int) (*models.Asset, error) {
	query := `
		SELECT id, symbol, name, decimals, is_active, created_at
		FROM assets
		WHERE id = $1`

	asset := &models.Asset{}
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&asset.ID, &asset.Symbol, &asset.Name, &asset.Decimals, &asset.IsActive, &asset.CreatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("asset not found: %d", id)
		}
		return nil, fmt.Errorf("failed to get asset: %w", err)
	}

	return asset, nil
}

// CreateAsset creates a new asset
func (s *adminService) CreateAsset(ctx context.Context, asset *models.Asset) error {
	if err := asset.Validate(); err != nil {
		return fmt.Errorf("asset validation failed: %w", err)
	}

	asset.CreatedAt = time.Now()

	query := `
		INSERT INTO assets (symbol, name, decimals, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`

	err := s.db.QueryRowContext(ctx, query, asset.Symbol, asset.Name, asset.Decimals, asset.IsActive, asset.CreatedAt).Scan(&asset.ID)
	if err != nil {
		return fmt.Errorf("failed to create asset: %w", err)
	}

	return nil
}

// UpdateAsset updates an existing asset
func (s *adminService) UpdateAsset(ctx context.Context, asset *models.Asset) error {
	if err := asset.Validate(); err != nil {
		return fmt.Errorf("asset validation failed: %w", err)
	}

	query := `
		UPDATE assets SET
			symbol = $2, name = $3, decimals = $4, is_active = $5
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, asset.ID, asset.Symbol, asset.Name, asset.Decimals, asset.IsActive)
	if err != nil {
		return fmt.Errorf("failed to update asset: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("asset not found: %d", asset.ID)
	}

	return nil
}

// DeleteAsset soft deletes an asset
func (s *adminService) DeleteAsset(ctx context.Context, id int) error {
	query := `
		UPDATE assets SET is_active = false
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete asset: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("asset not found: %d", id)
	}

	return nil
}

// Tag methods

// ListTags retrieves all tags
func (s *adminService) ListTags(ctx context.Context) ([]*models.Tag, error) {
	query := `
		SELECT id, name, category, is_active, created_at
		FROM tags
		WHERE is_active = true
		ORDER BY category, name`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list tags: %w", err)
	}
	defer rows.Close()

	var tags []*models.Tag
	for rows.Next() {
		tag := &models.Tag{}
		err := rows.Scan(&tag.ID, &tag.Name, &tag.Category, &tag.IsActive, &tag.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan tag: %w", err)
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

// GetTag retrieves a tag by ID
func (s *adminService) GetTag(ctx context.Context, id int) (*models.Tag, error) {
	query := `
		SELECT id, name, category, is_active, created_at
		FROM tags
		WHERE id = $1`

	tag := &models.Tag{}
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&tag.ID, &tag.Name, &tag.Category, &tag.IsActive, &tag.CreatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("tag not found: %d", id)
		}
		return nil, fmt.Errorf("failed to get tag: %w", err)
	}

	return tag, nil
}

// CreateTag creates a new tag
func (s *adminService) CreateTag(ctx context.Context, tag *models.Tag) error {
	if err := tag.Validate(); err != nil {
		return fmt.Errorf("tag validation failed: %w", err)
	}

	tag.CreatedAt = time.Now()

	query := `
		INSERT INTO tags (name, category, is_active, created_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id`

	err := s.db.QueryRowContext(ctx, query, tag.Name, tag.Category, tag.IsActive, tag.CreatedAt).Scan(&tag.ID)
	if err != nil {
		return fmt.Errorf("failed to create tag: %w", err)
	}

	return nil
}

// UpdateTag updates an existing tag
func (s *adminService) UpdateTag(ctx context.Context, tag *models.Tag) error {
	if err := tag.Validate(); err != nil {
		return fmt.Errorf("tag validation failed: %w", err)
	}

	query := `
		UPDATE tags SET
			name = $2, category = $3, is_active = $4
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, tag.ID, tag.Name, tag.Category, tag.IsActive)
	if err != nil {
		return fmt.Errorf("failed to update tag: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("tag not found: %d", tag.ID)
	}

	return nil
}

// DeleteTag soft deletes a tag
func (s *adminService) DeleteTag(ctx context.Context, id int) error {
	query := `
		UPDATE tags SET is_active = false
		WHERE id = $1`

	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete tag: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("tag not found: %d", id)
	}

	return nil
}
