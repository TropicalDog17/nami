package models

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

// TransactionCategory represents the main categories of transactions
type TransactionCategory string

const (
	// Operating Activities
	CashFlowOperating TransactionCategory = "operating"
	CashFlowFinancing TransactionCategory = "financing"
	CashFlowInvesting TransactionCategory = "investing"
	CashFlowTransfer  TransactionCategory = "transfer"
	CashFlowValuation TransactionCategory = "valuation"
)

// TransactionSubcategory represents detailed transaction types
type TransactionSubcategory string

const (
	// Operating Categories
	SubcategoryIncome   TransactionSubcategory = "income"
	SubcategoryExpense  TransactionSubcategory = "expense"
	SubcategoryInterest TransactionSubcategory = "interest"
	SubcategoryFee      TransactionSubcategory = "fee"
	SubcategoryTax      TransactionSubcategory = "tax"

	// Investment Categories
	SubcategoryBuy      TransactionSubcategory = "buy"
	SubcategorySell     TransactionSubcategory = "sell"
	SubcategoryDeposit  TransactionSubcategory = "deposit"
	SubcategoryWithdraw TransactionSubcategory = "withdraw"
	SubcategoryStake    TransactionSubcategory = "stake"
	SubcategoryUnstake  TransactionSubcategory = "unstake"
	SubcategoryLend     TransactionSubcategory = "lend"
	SubcategoryBorrow   TransactionSubcategory = "borrow"
	SubcategoryRepay    TransactionSubcategory = "repay"
	SubcategoryYield    TransactionSubcategory = "yield"
	SubcategoryAirdrop  TransactionSubcategory = "airdrop"
	SubcategoryReward   TransactionSubcategory = "reward"
	SubcategoryClaim    TransactionSubcategory = "claim"
	SubcategorySwap     TransactionSubcategory = "swap"

	// Transfer Categories
	SubcategoryTransfer     TransactionSubcategory = "transfer"
	SubcategoryInternalMove TransactionSubcategory = "internal_move"

	// Valuation Categories
	SubcategoryValuation  TransactionSubcategory = "valuation"
	SubcategoryAdjustment TransactionSubcategory = "adjustment"
)

// TransactionType represents a configurable transaction type with hierarchy
type TransactionType struct {
	ID          int                    `json:"id" db:"id"`
	Name        string                 `json:"name" db:"name"`
	Description *string                `json:"description" db:"description"`
	Category    TransactionCategory    `json:"category" db:"category"`
	Subcategory TransactionSubcategory `json:"subcategory" db:"subcategory"`
	IsActive    bool                   `json:"is_active" db:"is_active"`
	ParentID    *int                   `json:"parent_id" db:"parent_id"`
	SortOrder   int                    `json:"sort_order" db:"sort_order"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
}

// TransactionTypeValidationRules defines validation rules for transaction types
type TransactionTypeValidationRules struct {
	TypeID           int            `json:"type_id"`
	RequiredFields   []string       `json:"required_fields"`
	OptionalFields   []string       `json:"optional_fields"`
	ValidAccounts    []string       `json:"valid_accounts"`
	ValidAssets      []string       `json:"valid_assets"`
	CashFlowImpact   bool           `json:"cashflow_impact"`
	QuantityRequired bool           `json:"quantity_required"`
	PriceRequired    bool           `json:"price_required"`
	MinAmount        *DecimalAmount `json:"min_amount"`
	MaxAmount        *DecimalAmount `json:"max_amount"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

// DecimalAmount represents a decimal amount with currency
type DecimalAmount struct {
	Amount   decimal.Decimal `json:"amount"`
	Currency string          `json:"currency"`
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
