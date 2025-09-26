package models

import (
	"errors"
	"time"
)

// Account represents an account where assets are held
type Account struct {
	ID        int       `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Type      *string   `json:"type" db:"type"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// Asset represents a currency or token
type Asset struct {
	ID        int       `json:"id" db:"id"`
	Symbol    string    `json:"symbol" db:"symbol"`
	Name      *string   `json:"name" db:"name"`
	Decimals  int       `json:"decimals" db:"decimals"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// Tag represents a categorization tag
type Tag struct {
	ID        int       `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Category  *string   `json:"category" db:"category"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// Common account types
const (
	AccountTypeCash       = "Cash"
	AccountTypeBank       = "Bank"
	AccountTypeCreditCard = "CreditCard"
	AccountTypeExchange   = "Exchange"
	AccountTypeInvestment = "Investment"
	AccountTypePeer       = "Peer"
)

// Common tag categories
const (
	TagCategoryExpense    = "Expense"
	TagCategoryIncome     = "Income"
	TagCategoryInvestment = "Investment"
)

// Validate validates the account data
func (a *Account) Validate() error {
	if a.Name == "" {
		return errors.New("name is required")
	}
	if len(a.Name) > 100 {
		return errors.New("name must be 100 characters or less")
	}
	return nil
}

// Validate validates the asset data
func (a *Asset) Validate() error {
	if a.Symbol == "" {
		return errors.New("symbol is required")
	}
	if len(a.Symbol) > 10 {
		return errors.New("symbol must be 10 characters or less")
	}
	if a.Decimals < 0 {
		return errors.New("decimals must be non-negative")
	}
	return nil
}

// Validate validates the tag data
func (t *Tag) Validate() error {
	if t.Name == "" {
		return errors.New("name is required")
	}
	if len(t.Name) > 100 {
		return errors.New("name must be 100 characters or less")
	}
	return nil
}

// IsValidAccountType checks if the account type is valid
func IsValidAccountType(accountType string) bool {
	validTypes := []string{
		AccountTypeCash,
		AccountTypeBank,
		AccountTypeCreditCard,
		AccountTypeExchange,
		AccountTypeInvestment,
		AccountTypePeer,
	}

	for _, validType := range validTypes {
		if accountType == validType {
			return true
		}
	}
	return false
}

// IsValidTagCategory checks if the tag category is valid
func IsValidTagCategory(category string) bool {
	validCategories := []string{
		TagCategoryExpense,
		TagCategoryIncome,
		TagCategoryInvestment,
	}

	for _, validCategory := range validCategories {
		if category == validCategory {
			return true
		}
	}
	return false
}
