# Tasks: Transaction Tracking Schema

**Input**: Design documents from `/Users/mac/personal/nami/specs/001-title-transaction-tracking/`
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓
**Last Updated**: 2025-09-27

## Tech Stack Summary

- **Backend**: Go 1.21+ with standard library, PostgreSQL
- **Frontend**: React 18+ with Vite (modern build tooling)
- **Database**: PostgreSQL 15+ with decimal precision
- **External**: FX rate APIs (interface-first)
- **Architecture**: Interface-first, TDD, RESTful APIs

## Current Implementation Status

Based on git status and file analysis:
- ✅ Core backend structure with services and models
- ✅ FX rate caching and HTTP services implemented  
- ✅ Enhanced DataTable component with editing capabilities
- ✅ Comprehensive e2e test suite with Playwright
- ✅ Admin panel with CRUD operations
- 🔄 Transaction and reporting services need completion
- 🔄 Frontend-backend integration needs polish

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

- [x] **T012** [P] Test for Transaction model validation in backend/internal/models/transaction_test.go
- [x] **T013** [P] Test for derived field calculations in backend/internal/models/transaction_calculations_test.go
- [x] **T014** [P] Test for TransactionType CRUD in backend/internal/models/transaction_type_test.go
- [x] **T015** [P] Test for Account/Asset/Tag models in backend/internal/models/master_data_test.go

### Model Implementation

- [x] **T016** [P] Transaction model with validation in backend/internal/models/transaction.go
- [x] **T016b** [P] Input validation middleware for all API endpoints in backend/internal/middleware/validation.go
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

- [x] **T024** [P] TransactionService CRUD tests in backend/internal/services/transaction_service_test.go
- [ ] **T025** [P] ReportingService aggregation tests in backend/internal/services/reporting_service_test.go
- [x] **T026** [P] AdminService type management tests in backend/internal/services/admin_service_test.go
- [x] **T027** [P] FXProvider integration tests in backend/internal/services/fx_provider_test.go

### Service Implementation

- [x] **T028** TransactionService implementation in backend/internal/services/transaction_service.go
- [ ] **T029** ReportingService with SQL aggregations in backend/internal/services/reporting_service.go
- [x] **T030** AdminService with audit logging in backend/internal/services/admin_service.go
- [x] **T031** [P] Mock FXProvider for testing in backend/internal/services/fx_mock.go
- [x] **T032** [P] HTTP FXProvider implementation in backend/internal/services/fx_http.go
- [x] **T033** [P] FX cache service implementation in backend/internal/services/fx_cache.go

## Phase 3.5: API Layer & HTTP Handlers

### API Contract Tests

- [ ] **T034** [P] Transaction endpoints contract tests in backend/internal/handlers/transaction_test.go
- [ ] **T035** [P] Reporting endpoints contract tests in backend/internal/handlers/reporting_test.go
- [ ] **T036** [P] Admin endpoints contract tests in backend/internal/handlers/admin_test.go
- [ ] **T037** [P] FX rate endpoint contract tests in backend/internal/handlers/fx_test.go

### API Implementation

- [ ] **T038** Transaction CRUD handlers in backend/internal/handlers/transaction.go
- [ ] **T039** Reporting handlers (holdings, cashflow, spending, pnl) in backend/internal/handlers/reporting.go
- [ ] **T040** Admin handlers (types, accounts, assets, tags) in backend/internal/handlers/admin.go
- [ ] **T041** [P] FX rate handlers in backend/internal/handlers/fx.go
- [ ] **T042** HTTP router setup and middleware in backend/cmd/server/main.go

## Phase 3.6: React Frontend Foundation

### React Project Structure

- [x] **T043** [P] Main App component with routing in frontend/src/App.jsx
- [x] **T044** [P] Layout component with navigation in frontend/src/components/Layout.jsx
- [x] **T045** [P] Transaction page component in frontend/src/pages/TransactionPage.jsx
- [x] **T046** [P] Admin page component in frontend/src/pages/AdminPage.jsx
- [x] **T047** [P] Reports page component in frontend/src/pages/ReportsPage.jsx

### Styling & Configuration

- [x] **T048** [P] Global styles with Tailwind CSS in frontend/src/styles/globals.css
- [x] **T049** [P] Vite configuration and environment setup in frontend/vite.config.js
- [x] **T050** [P] React Router setup for client-side routing in frontend/src/router.jsx

### Core Services & State Management

- [x] **T051** [P] API client service with axios in frontend/src/services/api.js
- [x] **T052** [P] React context for global state management in frontend/src/context/AppContext.jsx
- [x] **T053** [P] Custom hooks for API calls in frontend/src/hooks/useApi.js

## Phase 3.7: React Frontend Components

### Transaction Input Components

- [x] **T054** [P] TransactionForm component with real-time calculations in frontend/src/components/TransactionForm.jsx
- [ ] **T055** [P] FXRateInput component with fetching and manual override in frontend/src/components/FXRateInput.jsx
- [ ] **T056** [P] FormValidation hook and save-as-draft functionality in frontend/src/hooks/useTransactionForm.js
- [x] **T057** [P] TransactionTypeSelector component in frontend/src/components/TransactionTypeSelector.jsx

### Admin Interface Components

- [x] **T058** [P] TransactionTypeManager component with CRUD in frontend/src/components/admin/TransactionTypeManager.jsx
- [x] **T059** [P] MasterDataManager component for accounts/assets/tags in frontend/src/components/admin/MasterDataManager.jsx
- [ ] **T060** [P] AuditTrailViewer component in frontend/src/components/admin/AuditTrailViewer.jsx
- [ ] **T061** [P] CSVImportExport component in frontend/src/components/admin/CSVImportExport.jsx

### Reporting Dashboard Components

- [ ] **T062** [P] HoldingsView component with currency toggle in frontend/src/components/reports/HoldingsView.jsx
- [ ] **T063** [P] CashFlowReports component with date filters in frontend/src/components/reports/CashFlowReports.jsx
- [ ] **T064** [P] SpendingBreakdown component with P&L metrics in frontend/src/components/reports/SpendingBreakdown.jsx
- [ ] **T065** [P] DrillDownTable component with data export in frontend/src/components/reports/DrillDownTable.jsx

### Shared UI Components

- [x] **T066** [P] DataTable component with sorting/filtering in frontend/src/components/ui/DataTable.jsx
- [x] **T067** [P] LoadingSpinner and ErrorBoundary components in frontend/src/components/ui/
- [ ] **T068** [P] Toast notification system in frontend/src/components/ui/Toast.jsx

## Phase 3.8: Integration & End-to-End

### Integration Tests

- [ ] **T069** [P] Full transaction creation flow test in backend/tests/integration/transaction_flow_test.go
- [ ] **T070** [P] Credit card two-step flow test in backend/tests/integration/credit_card_flow_test.go
- [ ] **T071** [P] Admin type modification flow test in backend/tests/integration/admin_flow_test.go
- [ ] **T072** [P] Reporting aggregation accuracy test in backend/tests/integration/reporting_test.go

### React Frontend-Backend Integration

- [ ] **T073** Connect React transaction components to backend APIs with proper state management
- [ ] **T074** Connect React admin components to backend APIs with optimistic updates
- [ ] **T075** Connect React reporting components to backend APIs with caching
- [ ] **T076** Add React loading states, error boundaries, and toast notifications

### Frontend Testing

- [x] **T077** [P] React component unit tests with React Testing Library in frontend/src/__tests__/
- [x] **T078** [P] Frontend integration tests with MSW (Mock Service Worker) in frontend/src/tests/
- [x] **T079** [P] End-to-end tests with Playwright in frontend/tests/e2e/

## Phase 3.9: Polish & Production Readiness

### Error Handling & Logging

- [ ] **T080** [P] Structured logging setup in backend/internal/logger/logger.go
- [ ] **T081** [P] HTTP error middleware in backend/internal/middleware/error.go
- [ ] **T082** [P] Request/response logging middleware in backend/internal/middleware/logging.go
- [ ] **T083** [P] CORS and security headers in backend/internal/middleware/security.go

### Performance & Monitoring

- [ ] **T084** [P] Database query optimization and explain analysis
- [ ] **T085** [P] Performance testing for 10k+ transactions in backend/tests/performance/load_test.go
- [ ] **T086** [P] HTTP response time monitoring and metrics
- [ ] **T087** [P] Health check endpoint in backend/internal/handlers/health.go
- [ ] **T088** [P] React performance optimization (code splitting, lazy loading)

### Build & Deployment

- [ ] **T089** [P] Docker setup for both backend and frontend in docker-compose.yml
- [ ] **T090** [P] Production build configuration for React frontend
- [ ] **T091** [P] Environment-specific configurations and secrets management

### Documentation & Deployment

- [ ] **T092** [P] API documentation in docs/api.md
- [ ] **T093** [P] Database schema documentation in docs/database.md
- [ ] **T094** [P] React component documentation with Storybook
- [ ] **T095** [P] Deployment guide and Docker setup in docs/deployment.md
- [ ] **T096** [P] User manual for transaction input in docs/user-guide.md

## Priority Actions (Next Steps)

### Critical Path - Backend API Completion
1. **T025** Complete ReportingService tests and implementation 
2. **T034-T037** API contract tests (blocking frontend integration)
3. **T038-T042** API handlers and router setup
4. **T029** Complete ReportingService SQL aggregations

### Critical Path - Frontend Integration  
1. **T055** FXRateInput component (blocks transaction form completion)
2. **T073** Connect transaction components to backend
3. **T074** Connect admin components to backend  
4. **T075** Connect reporting components to backend

### High Value - Reporting Features
1. **T062-T065** Reporting dashboard components
2. **T069** Transaction flow integration tests
3. **T072** Reporting aggregation tests

## Dependencies

### Critical Paths

1. **Backend Services** → **API Layer** → **Frontend Integration**
2. **ReportingService** (T025, T029) → **Reporting API** (T035, T039) → **Reporting UI** (T062-T065)
3. **FX Services** (✅ Complete) → **Transaction API** (T034, T038) → **Transaction UI Integration** (T073)

### Current Blockers

- **T025** ReportingService tests (blocking T029 implementation)
- **T034-T037** API contract tests (blocking frontend-backend integration)
- **T055** FXRateInput component (blocking transaction form completion)

## Parallel Execution Examples

### Phase 3.5 - API Layer (All Parallel)
```bash
Task: "Transaction endpoints contract tests in backend/internal/handlers/transaction_test.go"
Task: "Reporting endpoints contract tests in backend/internal/handlers/reporting_test.go"  
Task: "Admin endpoints contract tests in backend/internal/handlers/admin_test.go"
Task: "FX rate endpoint contract tests in backend/internal/handlers/fx_test.go"
```

### Phase 3.7 - Frontend Components (All Parallel)
```bash
Task: "FXRateInput component with fetching and manual override in frontend/src/components/FXRateInput.jsx"
Task: "HoldingsView component with currency toggle in frontend/src/components/reports/HoldingsView.jsx"
Task: "CashFlowReports component with date filters in frontend/src/components/reports/CashFlowReports.jsx"
Task: "AuditTrailViewer component in frontend/src/components/admin/AuditTrailViewer.jsx"
```

## Validation Checklist

- [x] Core backend services implemented (Transaction, Admin, FX)
- [x] Enhanced DataTable with editing capabilities  
- [x] Comprehensive e2e test suite
- [x] Admin panel CRUD operations
- [ ] ReportingService implementation
- [ ] API layer completion
- [ ] Frontend-backend integration
- [ ] Reporting dashboard components

## Success Criteria

### Functional
- [x] Transaction types supported with admin configurability
- [x] FX rate caching and HTTP services operational
- [ ] Dual-currency valuation (USD/VND) working accurately
- [ ] Credit card two-step flow implemented
- [ ] All reporting layers operational

### Technical  
- [x] Go backend with PostgreSQL running
- [x] React frontend with Vite build system
- [x] Interface-first architecture validated
- [x] FX provider integration implemented

### User Experience
- [x] React admin interface functional
- [x] Enhanced DataTable with inline editing
- [x] Comprehensive test coverage
- [ ] React transaction form with real-time calculations
- [ ] Rich React reporting dashboard

## Notes

- **Major Progress**: FX services, enhanced DataTable, and e2e tests completed
- **Next Focus**: Complete ReportingService and API layer
- **Integration Ready**: FX services can now support transaction processing
- **Testing Coverage**: E2e tests provide confidence for UI changes
- **TDD Enforcement**: Maintain test-first approach for remaining API work

Total Tasks: **96 tasks** organized into **9 phases** with **~75% completion** on core infrastructure.