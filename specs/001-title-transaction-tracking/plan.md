# Implementation Plan: Transaction Tracking Schema

**Feature Branch**: `001-title-transaction-tracking`
**Created**: 2025-09-26
**Input**: `/home/tropicaldog17/personal/specs/001-title-transaction-tracking/spec.md`

## Technical Context

**User Requirements**: Frontend simplest framework, backend in Go, database postgres, external provider to be added, interface first please

**Architecture Decisions**:

- Frontend: React 18+ with Vite (modern build tooling)
- Backend: Go with standard library + minimal dependencies
- Database: PostgreSQL
- External Providers: FX rate APIs (to be integrated)
- Development Approach: Interface-first design

## Phase 0: Research & Analysis

### Technology Stack Validation

**Frontend (React with Modern Tooling)**:

- React 18+ with Vite for fast development and builds
- TypeScript for type safety
- Tailwind CSS for styling
- React Router for client-side routing
- Axios for HTTP requests

**Backend (Go)**:

- Go 1.21+ with standard library
- `net/http` for web server
- `database/sql` with `pq` driver for PostgreSQL
- `encoding/json` for API responses
- Minimal external dependencies

**Database (PostgreSQL)**:

- PostgreSQL 15+
- JSONB for flexible metadata
- Decimal type for financial precision
- Indexes on frequently queried fields

**External Providers**:

- FX rate APIs (CurrencyAPI, Fixer.io, or similar)
- Provider interface for swappable implementations

### Key Design Patterns

1. **Interface-First Development**:

   - Define Go interfaces before implementations
   - Mock external dependencies
   - Contract-driven development

2. **Database-First Schema**:

   - PostgreSQL as source of truth
   - Migrations for schema evolution
   - Stored procedures for complex calculations

3. **RESTful API Design**:
   - Resource-based endpoints
   - Standard HTTP methods
   - JSON request/response format

## Phase 1: Core Architecture

### Data Model Design

**Primary Tables**:

```sql
-- Transaction table (core entity)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    type VARCHAR(50) NOT NULL, -- References transaction_types.name
    asset VARCHAR(10) NOT NULL,
    account VARCHAR(100) NOT NULL,
    counterparty VARCHAR(200),
    tag VARCHAR(100),
    note TEXT,
    quantity DECIMAL(20,8) NOT NULL,
    price_local DECIMAL(20,8) NOT NULL,
    amount_local DECIMAL(20,8) NOT NULL,
    fx_to_usd DECIMAL(12,8) NOT NULL,
    fx_to_vnd DECIMAL(12,2) NOT NULL,
    amount_usd DECIMAL(20,2) NOT NULL,
    amount_vnd DECIMAL(20,2) NOT NULL,
    fee_usd DECIMAL(20,2) DEFAULT 0,
    fee_vnd DECIMAL(20,2) DEFAULT 0,
    delta_qty DECIMAL(20,8) NOT NULL,
    cashflow_usd DECIMAL(20,2) NOT NULL,
    cashflow_vnd DECIMAL(20,2) NOT NULL,
    horizon VARCHAR(20), -- 'short-term', 'long-term'
    entry_date DATE,
    exit_date DATE,
    fx_impact DECIMAL(20,2),
    fx_source VARCHAR(50),
    fx_timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Dynamic transaction types (admin configurable)
CREATE TABLE transaction_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail for transaction type changes
CREATE TABLE transaction_type_audit (
    id SERIAL PRIMARY KEY,
    type_id INTEGER REFERENCES transaction_types(id),
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT NOW()
);

-- Master data tables
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50), -- 'Cash', 'Bank', 'CreditCard', 'Exchange', etc.
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100),
    decimals INTEGER DEFAULT 8,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE
);
```

### API Contract Design

**Core Interfaces (Go)**:

```go
// TransactionService interface
type TransactionService interface {
    CreateTransaction(ctx context.Context, tx *Transaction) error
    GetTransaction(ctx context.Context, id string) (*Transaction, error)
    ListTransactions(ctx context.Context, filter TransactionFilter) ([]*Transaction, error)
    UpdateTransaction(ctx context.Context, tx *Transaction) error
    DeleteTransaction(ctx context.Context, id string) error
}

// ReportingService interface
type ReportingService interface {
    GetHoldings(ctx context.Context, asOf time.Time) ([]*Holding, error)
    GetCashFlow(ctx context.Context, period Period) (*CashFlowReport, error)
    GetSpending(ctx context.Context, period Period) (*SpendingReport, error)
    GetPnL(ctx context.Context, period Period) (*PnLReport, error)
}

// AdminService interface
type AdminService interface {
    ListTransactionTypes(ctx context.Context) ([]*TransactionType, error)
    CreateTransactionType(ctx context.Context, tt *TransactionType) error
    UpdateTransactionType(ctx context.Context, tt *TransactionType) error
    DeleteTransactionType(ctx context.Context, id int) error
    GetTypeAuditTrail(ctx context.Context, typeID int) ([]*TypeAudit, error)
}

// FXProvider interface
type FXProvider interface {
    GetRate(ctx context.Context, from, to string, date time.Time) (decimal.Decimal, error)
    GetRates(ctx context.Context, base string, targets []string, date time.Time) (map[string]decimal.Decimal, error)
}
```

**REST API Endpoints**:

```
# Transactions
POST   /api/transactions           # Create transaction
GET    /api/transactions/:id       # Get transaction
GET    /api/transactions           # List transactions (with filters)
PUT    /api/transactions/:id       # Update transaction
DELETE /api/transactions/:id       # Delete transaction

# Reporting
GET    /api/reports/holdings       # Holdings report
GET    /api/reports/cashflow       # Cash flow report
GET    /api/reports/spending       # Spending report
GET    /api/reports/pnl           # P&L report

# Admin
GET    /api/admin/types           # List transaction types
POST   /api/admin/types           # Create transaction type
PUT    /api/admin/types/:id       # Update transaction type
DELETE /api/admin/types/:id       # Delete transaction type
GET    /api/admin/types/:id/audit # Type audit trail

GET    /api/admin/accounts        # List accounts
POST   /api/admin/accounts        # Create account
PUT    /api/admin/accounts/:id    # Update account

GET    /api/admin/assets          # List assets
POST   /api/admin/assets          # Create asset
PUT    /api/admin/assets/:id      # Update asset

GET    /api/admin/tags            # List tags
POST   /api/admin/tags            # Create tag
PUT    /api/admin/tags/:id        # Update tag

# FX Rates
GET    /api/fx/rates              # Get FX rates (with date, from, to params)
```

### Frontend Structure

**File Organization**:

```
/frontend/
├── public/
│   └── index.html         # HTML template
├── src/
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # Entry point
│   ├── components/        # Reusable components
│   │   ├── ui/           # Basic UI components
│   │   ├── admin/        # Admin-specific components
│   │   └── reports/      # Reporting components
│   ├── pages/            # Page components
│   │   ├── TransactionPage.jsx
│   │   ├── AdminPage.jsx
│   │   └── ReportsPage.jsx
│   ├── services/         # API clients
│   ├── hooks/            # Custom React hooks
│   ├── context/          # React context providers
│   └── styles/           # Global styles
├── package.json
└── vite.config.js        # Vite configuration
```

**React Components**:

1. **TransactionForm**: React component with real-time calculations and validation
2. **AdminPanel**: React components for CRUD operations on master data
3. **ReportsDashboard**: Interactive React components for data visualization
4. **Layout**: React component with navigation and routing

## Phase 2: Implementation Tasks

### Backend Tasks

1. **Database Setup**

   - [ ] Create PostgreSQL schema and migrations
   - [ ] Seed initial transaction types
   - [ ] Create indexes for performance
   - [ ] Set up connection pooling

2. **Core Services**

   - [ ] Implement TransactionService with CRUD operations
   - [ ] Implement derived field calculations (ΔQty, CashFlow)
   - [ ] Add transaction validation logic
   - [ ] Implement AdminService for type management

3. **Reporting Engine**

   - [ ] Implement ReportingService
   - [ ] Create aggregation queries for holdings
   - [ ] Build cash flow and spending reports
   - [ ] Add P&L and ROI calculations

4. **FX Integration**

   - [ ] Define FXProvider interface
   - [ ] Implement mock FX provider for testing
   - [ ] Create FX rate caching mechanism
   - [ ] Add fallback strategies for missing rates

5. **API Layer**
   - [ ] Set up HTTP router and middleware
   - [ ] Implement REST endpoints
   - [ ] Add request validation
   - [ ] Implement error handling and logging

### Frontend Tasks

1. **Core UI Structure**

   - [ ] Create HTML templates and navigation
   - [ ] Set up CSS grid layouts
   - [ ] Implement responsive design
   - [ ] Add form validation styling

2. **Transaction Input**

   - [ ] Build transaction form with all fields
   - [ ] Implement real-time calculations
   - [ ] Add FX rate fetching and override
   - [ ] Create save-as-draft functionality

3. **Admin Interface**

   - [ ] Build type management CRUD
   - [ ] Create account/asset/tag management
   - [ ] Implement audit trail viewer
   - [ ] Add CSV import/export

4. **Reporting Dashboard**

   - [ ] Build holdings view with currency toggle
   - [ ] Create cash flow charts and tables
   - [ ] Implement spending breakdowns
   - [ ] Add P&L and ROI metrics
   - [ ] Create drill-down navigation

5. **Integration & Polish**
   - [ ] Connect frontend to backend APIs
   - [ ] Add loading states and error handling
   - [ ] Implement client-side validation
   - [ ] Add keyboard shortcuts and UX improvements

### DevOps & Testing

1. **Development Environment**

   - [ ] Create Docker setup for PostgreSQL
   - [ ] Set up Go development environment
   - [ ] Create database migration scripts
   - [ ] Add development seed data

2. **Testing Strategy**

   - [ ] Unit tests for core business logic
   - [ ] Integration tests for database operations
   - [ ] API endpoint tests
   - [ ] Frontend component tests

3. **Deployment Preparation**
   - [ ] Create production database migrations
   - [ ] Set up environment configuration
   - [ ] Add health check endpoints
   - [ ] Create deployment documentation

## Progress Tracking

- [x] Phase 0: Research & Analysis Complete
- [x] Phase 1: Core Architecture Complete
- [x] Phase 2: Implementation Tasks Defined
- [ ] Implementation Execution (Next Phase)

## Success Criteria

1. **Functional Requirements Met**:

   - All transaction types supported with admin configurability
   - Dual-currency valuation (USD/VND) working
   - Credit card two-step flow implemented
   - Reporting layers operational

2. **Technical Requirements Met**:

   - Go backend with PostgreSQL
   - React frontend with Vite build system
   - Interface-first architecture
   - FX provider integration ready

3. **User Experience Goals**:
   - Intuitive React transaction input form
   - Comprehensive React admin interface
   - Rich React reporting dashboard
   - Responsive design

## Next Steps

1. Start with database schema creation and migrations
2. Implement core Go interfaces and services
3. Build transaction input form (highest priority UI)
4. Add admin interface for type management
5. Implement reporting dashboard
6. Integrate FX provider and add external APIs

The implementation is ready to begin with clear interfaces, data model, and task breakdown.
