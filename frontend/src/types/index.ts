/**
 * Domain type definitions for the Vibe Kanban frontend.
 * Centralized types to ensure consistency across the application.
 */

// ============================================================================
// Master Data Types
// ============================================================================

export interface TransactionType {
    id?: string | number;
    name: string;
    description?: string;
    is_active: boolean;
}

export interface Account {
    id?: string | number;
    name: string;
    type?: string;
    is_active: boolean;
}

export interface Asset {
    id?: string | number;
    symbol: string;
    name?: string;
    is_active: boolean;
}

export interface Tag {
    id?: string | number;
    name: string;
    category?: string;
    is_active: boolean;
}

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionTypeValue =
    | 'expense'
    | 'income'
    | 'transfer'
    | 'buy'
    | 'sell'
    | 'dividend';

export interface Transaction {
    id?: string | number;
    date: string; // ISO 8601 datetime string
    type: TransactionTypeValue;
    quantity?: string;
    price_local?: string;
    amount_local?: string;
    asset: string;
    account: string;
    tag?: string;
    category?: string;
    note?: string;
    counterparty?: string;
    fx_to_usd?: string;
    fx_to_vnd?: string;
    amount_usd?: string;
    amount_vnd?: string;
    fee_usd?: string;
    fee_vnd?: string;
}

// ============================================================================
// Vault Types
// ============================================================================

export interface Vault {
    id?: string | number;
    name: string;
    asset?: string;
    horizon?: string;
    status?: 'active' | 'inactive' | 'closed';
    is_open?: boolean;
    deposit_qty?: number;
    deposit_cost?: number;
    current_value?: number;
    pnl?: number;
    pnl_percent?: number;
}

// ============================================================================
// Form Types
// ============================================================================

export interface ExpenseFormData {
    date: string;
    dueDate?: string;
    amount: string;
    category: string;
    note: string;
    account: string;
    asset: string;
    payee: string;
}

export interface IncomeFormData {
    date: string;
    amount: string;
    note: string;
    account: string;
    asset: string;
    payer: string;
}

export interface TransferFormData {
    date: string;
    quantity: string;
    from_account: string;
    to_account: string;
    asset: string;
    fee: string;
    note: string;
}

export interface VaultFormData {
    name: string;
    asset: string;
    horizon: string;
    depositQty: string;
    depositCost: string;
    date: string;
}

// ============================================================================
// Modal Types
// ============================================================================

export type ModalType =
    | 'expense'
    | 'income'
    | 'transfer'
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'vault'
    | 'initBalance'
    | 'borrowLoan'
    | 'loan'
    | 'repay';

export interface ModalState {
    isOpen: boolean;
    modalType: ModalType | null;
}

// ============================================================================
// Select Option Types
// ============================================================================

export interface SelectOption {
    value: string;
    label: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
    data?: T;
    error?: string;
    message?: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export type Currency = 'USD' | 'VND';

export interface LoadingState {
    isLoading: boolean;
    error: string | null;
}
