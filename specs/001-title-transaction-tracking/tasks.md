# Tasks: Transaction Tracking Schema

**Input**: Design documents from `/home/tropicaldog17/personal/nami/specs/001-title-transaction-tracking/`
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓

## Tech Stack Summary

- **Backend**: Go 1.21+ with standard library, PostgreSQL
- **Frontend**: React 18+ with Vite (modern build tooling)
- **Database**: PostgreSQL 15+ with decimal precision
- **External**: FX rate APIs (interface-first)
- **Architecture**: Interface-first, TDD, RESTful APIs

## Phase 3.1: Setup & Environment

- [x] **T001** Create project structure with backend/, frontend/, migrations/, docs/
- [x] **T002** Initialize Go module with minimal dependencies (pq driver, decimal library)
- [x] **T002b** Initialize React frontend with Vite, React Router, and essential dependencies
- [x] **T003** [P] Set up PostgreSQL Docker container with init scripts
- [x] **T004** [P] Configure Go linting (golangci-lint) and formatting (gofmt)
- [x] **T005** [P] Configure ESLint, Prettier for React frontend
- [x] **T006** [P] Create environment configuration (dev, test, prod) for both backend and frontend

## Phase 3.2: Database Foundation

- [x] **T007** Create database migration 001_initial_schema.sql with all tables
- [x] **T008** Create database migration 002_indexes.sql for performance indexes
- [x] **T009** Create database migration 003_seed_data.sql with initial transaction types
- [x] **T010** [P] Create migration runner script in migrations/migrate.go
- [x] **T011** [P] Add database connection pool setup in backend/internal/db/connection.go

## Phase 3.3: Core Data Models & Interfaces (TDD)

### Test First - Core Models

- [ ] **T012** [P] Test for Transaction model validation in backend/internal/models/transaction_test.go
- [ ] **T013** [P] Test for derived field calculations in backend/internal/models/transaction_calculations_test.go
- [ ] **T014** [P] Test for TransactionType CRUD in backend/internal/models/transaction_type_test.go
- [ ] **T015** [P] Test for Account/Asset/Tag models in backend/internal/models/master_data_test.go

### Model Implementation

- [x] **T016** [P] Transaction model with validation in backend/internal/models/transaction.go
- [ ] **T016b** [P] Input validation middleware for all API endpoints in backend/internal/middleware/validation.go
- [x] **T017** [P] TransactionType model with audit trail in backend/internal/models/transaction_type.go
- [x] **T018** [P] Account, Asset, Tag models in backend/internal/models/master_data.go
- [x] **T019** [P] FXRate model and caching in backend/internal/models/fx_rate.go

## Phase 3.4: Service Layer Interfaces & Tests

### Interface Definitions

- [x] **T020** [P] TransactionService interface in backend/internal/services/interfaces.go
- [x] **T021** [P] ReportingService interface in backend/internal/services/interfaces.go
- [x] **T022** [P] AdminService interface in backend/internal/services/interfaces.go
- [x] **T023** [P] FXProvider interface in backend/internal/services/interfaces.go

### Service Tests (Must Fail First)

- [ ] **T024** [P] TransactionService CRUD tests in backend/internal/services/transaction_service_test.go
- [ ] **T025** [P] ReportingService aggregation tests in backend/internal/services/reporting_service_test.go
- [ ] **T026** [P] AdminService type management tests in backend/internal/services/admin_service_test.go
- [ ] **T027** [P] FXProvider integration tests in backend/internal/services/fx_provider_test.go

### Service Implementation

- [x] **T028** TransactionService implementation in backend/internal/services/transaction_service.go
- [ ] **T029** ReportingService with SQL aggregations in backend/internal/services/reporting_service.go
- [x] **T030** AdminService with audit logging in backend/internal/services/admin_service.go
- [ ] **T031** [P] Mock FXProvider for testing in backend/internal/services/fx_mock.go
- [ ] **T032** [P] HTTP FXProvider implementation in backend/internal/services/fx_http.go

## Phase 3.5: API Layer & HTTP Handlers

### API Contract Tests

- [ ] **T033** [P] Transaction endpoints contract tests in backend/internal/handlers/transaction_test.go
- [ ] **T034** [P] Reporting endpoints contract tests in backend/internal/handlers/reporting_test.go
- [ ] **T035** [P] Admin endpoints contract tests in backend/internal/handlers/admin_test.go
- [ ] **T036** [P] FX rate endpoint contract tests in backend/internal/handlers/fx_test.go

### API Implementation

- [ ] **T037** Transaction CRUD handlers in backend/internal/handlers/transaction.go
- [ ] **T038** Reporting handlers (holdings, cashflow, spending, pnl) in backend/internal/handlers/reporting.go
- [ ] **T039** Admin handlers (types, accounts, assets, tags) in backend/internal/handlers/admin.go
- [ ] **T040** [P] FX rate handlers in backend/internal/handlers/fx.go
- [ ] **T041** HTTP router setup and middleware in backend/cmd/server/main.go

## Phase 3.6: React Frontend Foundation

### React Project Structure

- [ ] **T042** [P] Main App component with routing in frontend/src/App.jsx
- [ ] **T043** [P] Layout component with navigation in frontend/src/components/Layout.jsx
- [ ] **T044** [P] Transaction page component in frontend/src/pages/TransactionPage.jsx
- [ ] **T045** [P] Admin page component in frontend/src/pages/AdminPage.jsx
- [ ] **T046** [P] Reports page component in frontend/src/pages/ReportsPage.jsx

### Styling & Configuration

- [ ] **T047** [P] Global styles with Tailwind CSS in frontend/src/styles/globals.css
- [ ] **T048** [P] Vite configuration and environment setup in frontend/vite.config.js
- [ ] **T049** [P] React Router setup for client-side routing in frontend/src/router.jsx

### Core Services & State Management

- [ ] **T050** [P] API client service with axios in frontend/src/services/api.js
- [ ] **T051** [P] React context for global state management in frontend/src/context/AppContext.jsx
- [ ] **T052** [P] Custom hooks for API calls in frontend/src/hooks/useApi.js

## Phase 3.7: React Frontend Components

### Transaction Input Components

- [ ] **T053** [P] TransactionForm component with real-time calculations in frontend/src/components/TransactionForm.jsx
- [ ] **T054** [P] FXRateInput component with fetching and manual override in frontend/src/components/FXRateInput.jsx
- [ ] **T055** [P] FormValidation hook and save-as-draft functionality in frontend/src/hooks/useTransactionForm.js
- [ ] **T056** [P] TransactionTypeSelector component in frontend/src/components/TransactionTypeSelector.jsx

### Admin Interface Components

- [ ] **T057** [P] TransactionTypeManager component with CRUD in frontend/src/components/admin/TransactionTypeManager.jsx
- [ ] **T058** [P] MasterDataManager component for accounts/assets/tags in frontend/src/components/admin/MasterDataManager.jsx
- [ ] **T059** [P] AuditTrailViewer component in frontend/src/components/admin/AuditTrailViewer.jsx
- [ ] **T060** [P] CSVImportExport component in frontend/src/components/admin/CSVImportExport.jsx

### Reporting Dashboard Components

- [ ] **T061** [P] HoldingsView component with currency toggle in frontend/src/components/reports/HoldingsView.jsx
- [ ] **T062** [P] CashFlowReports component with date filters in frontend/src/components/reports/CashFlowReports.jsx
- [ ] **T063** [P] SpendingBreakdown component with P&L metrics in frontend/src/components/reports/SpendingBreakdown.jsx
- [ ] **T064** [P] DrillDownTable component with data export in frontend/src/components/reports/DrillDownTable.jsx

### Shared UI Components

- [ ] **T065** [P] DataTable component with sorting/filtering in frontend/src/components/ui/DataTable.jsx
- [ ] **T066** [P] LoadingSpinner and ErrorBoundary components in frontend/src/components/ui/
- [ ] **T067** [P] Toast notification system in frontend/src/components/ui/Toast.jsx

## Phase 3.8: Integration & End-to-End

### Integration Tests

- [ ] **T068** [P] Full transaction creation flow test in backend/tests/integration/transaction_flow_test.go
- [ ] **T069** [P] Credit card two-step flow test in backend/tests/integration/credit_card_flow_test.go
- [ ] **T070** [P] Admin type modification flow test in backend/tests/integration/admin_flow_test.go
- [ ] **T071** [P] Reporting aggregation accuracy test in backend/tests/integration/reporting_test.go

### React Frontend-Backend Integration

- [ ] **T072** Connect React transaction components to backend APIs with proper state management
- [ ] **T073** Connect React admin components to backend APIs with optimistic updates
- [ ] **T074** Connect React reporting components to backend APIs with caching
- [ ] **T075** Add React loading states, error boundaries, and toast notifications

### Frontend Testing

- [ ] **T076** [P] React component unit tests with React Testing Library in frontend/src/**tests**/
- [ ] **T077** [P] Frontend integration tests with MSW (Mock Service Worker) in frontend/src/tests/
- [ ] **T078** [P] End-to-end tests with Playwright in frontend/e2e/

## Phase 3.9: Polish & Production Readiness

### Error Handling & Logging

- [ ] **T079** [P] Structured logging setup in backend/internal/logger/logger.go
- [ ] **T080** [P] HTTP error middleware in backend/internal/middleware/error.go
- [ ] **T081** [P] Request/response logging middleware in backend/internal/middleware/logging.go
- [ ] **T082** [P] CORS and security headers in backend/internal/middleware/security.go

### Performance & Monitoring

- [ ] **T083** [P] Database query optimization and explain analysis
- [ ] **T083b** [P] Performance testing for 10k+ transactions in backend/tests/performance/load_test.go
- [ ] **T084** [P] HTTP response time monitoring and metrics
- [ ] **T085** [P] Health check endpoint in backend/internal/handlers/health.go
- [ ] **T086** [P] React performance optimization (code splitting, lazy loading)

### Build & Deployment

- [ ] **T087** [P] Docker setup for both backend and frontend in docker-compose.yml
- [ ] **T088** [P] Production build configuration for React frontend
- [ ] **T089** [P] Environment-specific configurations and secrets management

### Documentation & Deployment

- [ ] **T090** [P] API documentation in docs/api.md
- [ ] **T091** [P] Database schema documentation in docs/database.md
- [ ] **T092** [P] React component documentation with Storybook
- [ ] **T093** [P] Deployment guide and Docker setup in docs/deployment.md
- [ ] **T094** [P] User manual for transaction input in docs/user-guide.md

## Dependencies

### Critical Paths

1. **Setup** (T001-T006) → **Database** (T007-T011) → **Models** (T012-T019)
2. **Models** → **Services** (T020-T032) → **API** (T033-T041)
3. **API** → **React Integration** (T072-T075)
4. **Database** → **React Foundation** (T042-T052) [can run parallel to backend]

### Blocking Dependencies

- T012-T015 (model tests) MUST fail before T016-T019 (model implementation)
- T024-T027 (service tests) MUST fail before T028-T032 (service implementation)
- T033-T036 (API tests) MUST fail before T037-T041 (API implementation)
- T007-T009 (migrations) before any database-dependent tests
- T020-T023 (interfaces) before T024-T027 (service tests)
- T042-T052 (React foundation) before T053-T067 (React components)

## Parallel Execution Examples

### Phase 3.2 - Database Setup (All Parallel)

```bash
Task: "Create migration 001_initial_schema.sql with all tables"
Task: "Create migration 002_indexes.sql for performance indexes"
Task: "Create migration 003_seed_data.sql with initial transaction types"
Task: "Create migration runner script in migrations/migrate.go"
Task: "Add database connection pool setup in backend/internal/db/connection.go"
```

### Phase 3.3 - Model Tests (All Parallel)

```bash
Task: "Test for Transaction model validation in backend/internal/models/transaction_test.go"
Task: "Test for derived field calculations in backend/internal/models/transaction_calculations_test.go"
Task: "Test for TransactionType CRUD in backend/internal/models/transaction_type_test.go"
Task: "Test for Account/Asset/Tag models in backend/internal/models/master_data_test.go"
```

### Phase 3.6 - React Foundation (All Parallel)

```bash
Task: "Main App component with routing in frontend/src/App.jsx"
Task: "Layout component with navigation in frontend/src/components/Layout.jsx"
Task: "Transaction page component in frontend/src/pages/TransactionPage.jsx"
Task: "Admin page component in frontend/src/pages/AdminPage.jsx"
Task: "Reports page component in frontend/src/pages/ReportsPage.jsx"
Task: "Global styles with Tailwind CSS in frontend/src/styles/globals.css"
Task: "API client service with axios in frontend/src/services/api.js"
```

### Phase 3.7 - React Components (All Parallel)

```bash
Task: "TransactionForm component with real-time calculations in frontend/src/components/TransactionForm.jsx"
Task: "FXRateInput component with fetching and manual override in frontend/src/components/FXRateInput.jsx"
Task: "TransactionTypeManager component with CRUD in frontend/src/components/admin/TransactionTypeManager.jsx"
Task: "HoldingsView component with currency toggle in frontend/src/components/reports/HoldingsView.jsx"
Task: "DataTable component with sorting/filtering in frontend/src/components/ui/DataTable.jsx"
```

## Validation Checklist

- [x] All database entities have model tasks (Transaction, TransactionType, Account, Asset, Tag, FXRate)
- [x] All service interfaces have corresponding tests and implementations
- [x] All API endpoints have contract tests and handlers
- [x] All React pages have corresponding components and state management
- [x] Tests come before implementation (TDD enforced)
- [x] Parallel tasks are in different files with no dependencies
- [x] Each task specifies exact file path
- [x] Critical user flows have integration tests (transaction creation, credit card flow, admin management)
- [x] React components are properly organized with pages, components, hooks, and services
- [x] Frontend testing includes unit, integration, and e2e tests

## Success Criteria

### Functional

- [ ] All 15+ transaction types supported with admin configurability
- [ ] Dual-currency valuation (USD/VND) working accurately
- [ ] Credit card two-step flow (expense → repay_borrow) implemented
- [ ] All reporting layers operational (holdings, cashflow, spending, P&L)

### Technical

- [ ] Go backend with PostgreSQL running
- [ ] React frontend with Vite build system
- [ ] Interface-first architecture validated
- [ ] FX provider integration ready for external APIs

### User Experience

- [ ] React transaction form with real-time calculations and validation
- [ ] React admin interface for all master data management
- [ ] Rich React reporting dashboard with interactive components
- [ ] Responsive design working on desktop and mobile

## Notes

- **TDD Enforcement**: Tests T012-T015, T024-T027, T033-T036 MUST be written first and MUST fail
- **Parallel Safety**: All [P] tasks modify different files and have no shared dependencies
- **React Architecture**: Modern React with hooks, context, and functional components
- **File Organization**: Backend follows Go project layout, frontend follows React/Vite best practices
- **Database First**: Schema migrations come before any code that uses the database
- **Interface First**: All service interfaces defined before implementations
- **External Dependencies**: FX provider designed as swappable interface for future API integration
- **Modern Tooling**: Vite for fast builds, Tailwind for styling, React Testing Library for testing

Total Tasks: **94 tasks** organized into **9 phases** with clear dependencies and parallel execution opportunities.
