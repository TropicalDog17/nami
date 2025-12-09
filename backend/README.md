# Backend

Go API server providing comprehensive transaction tracking and financial management capabilities.

## Structure

- **`cmd/server/`** - Main server application entry point
- **`internal/`** - Core application packages and business logic
- **`tests/`** - Unit and integration test suites

## Core Components

- **API Layer** - REST handlers and middleware for HTTP endpoints
- **Services** - Business logic layer with transaction, admin, and reporting services
- **Models** - Data models and validation with derived field calculations
- **Repositories** - Database access layer with SQL operations
- **Database** - PostgreSQL connection management and utilities

Provides transaction CRUD operations, admin configuration, reporting, and audit logging with comprehensive validation and error handling.

## Testing & Coverage

- Run unit tests (short mode):
  - `make test-unit`
- Run integration tests (testcontainers):
  - `make test-integration`
- Run backend tests with coverage and enforce a threshold (default 60%):
  - `make backend-cover` or `make backend-cover COVER_THRESH=70`

Artifacts:
- Coverage profile: `backend/coverage.out`
- Function coverage summary: `go tool cover -func backend/coverage.out`
- HTML report: `go tool cover -html backend/coverage.out -o backend/coverage.html`