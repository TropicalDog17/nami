# Backend Structure

## Purpose
The backend is a Go-based REST API that provides core business logic for transaction tracking, financial management, and investment monitoring. It handles data persistence, business rules, and serves as the central data store for the entire Nami application.

## Architecture Overview
The backend follows clean architecture principles with layered separation:
- **API Layer**: HTTP handlers and routing
- **Service Layer**: Business logic and orchestration
- **Repository Layer**: Data access and persistence
- **Model Layer**: Data structures and domain entities
- **Infrastructure**: Database, logging, and error handling

## Folder Structure

```
backend/
├── cmd/                     # Application entry points
│   └── server/              # HTTP server application
│       └── main.go         # Server initialization and routing
├── internal/                # Private application code
│   ├── handlers/            # HTTP request handlers
│   │   ├── action.go       # Action and trigger endpoints
│   │   ├── admin.go        # Administrative endpoints
│   │   ├── fx.go           # Foreign exchange endpoints
│   │   ├── investment.go   # Investment management endpoints
│   │   ├── pending_actions.go # AI processing queue
│   │   ├── price.go        # Asset price endpoints
│   │   ├── reporting.go    # Financial reporting endpoints
│   │   ├── transaction.go  # Transaction management endpoints
│   │   └── vault.go        # Vault management endpoints
│   ├── services/            # Business logic layer
│   │   ├── action_service.go # Action and trigger logic
│   │   ├── admin_service.go # Administrative operations
│   │   ├── ai_pending_action_service.go # AI processing queue
│   │   ├── asset_price_service.go # Asset price management
│   │   ├── crypto_price_provider.go # Cryptocurrency price feeds
│   │   ├── fx_cache.go     # Foreign exchange caching
│   │   ├── fx_history_service.go # FX historical data
│   │   ├── fx_http.go      # FX HTTP client
│   │   ├── investment_service.go # Investment management
│   │   ├── link_service.go # Link and relationship management
│   │   ├── price_cache.go  # Price data caching
│   │   ├── price_mapping_resolver.go # Asset price mapping
│   │   ├── reporting_service.go # Financial reporting
│   │   ├── transaction_service.go # Transaction processing
│   │   └── interfaces.go   # Service interface definitions
│   ├── repositories/        # Data access layer
│   │   ├── interfaces.go   # Repository interface definitions
│   │   ├── transaction_repository.go # Transaction data access
│   │   ├── investment_repository.go # Investment data access
│   │   ├── reporting_repository.go # Reporting data access
│   │   └── ai_pending_action_repository.go # AI queue data access
│   ├── models/              # Domain entities and data structures
│   │   ├── transaction.go  # Transaction entity
│   │   ├── transaction_type.go # Transaction type definitions
│   │   ├── investment.go   # Investment entity
│   │   ├── actions.go      # Action and trigger entities
│   │   ├── ai_pending_action.go # AI queue entity
│   │   ├── asset_price.go  # Asset price entity
│   │   ├── asset_price_mapping.go # Price mapping entity
│   │   ├── fx_rate.go      # Foreign exchange rate entity
│   │   ├── master_data.go  # Master configuration data
│   │   └── reporting.go    # Reporting data structures
│   ├── db/                  # Database infrastructure
│   │   └── connection.go   # Database connection management
│   ├── errors/              # Error handling
│   │   └── errors.go       # Custom error types and handling
│   └── logger/              # Logging infrastructure
│       └── logger.go       # Logging configuration and utilities
├── migrations/              # Database migration scripts
│   └── migrate.go          # Migration management
├── tests/                   # Test files
│   └── integration/         # Integration tests
├── docs/                    # Generated API documentation
│   └── docs.go             # Swagger documentation
└── Configuration files       # go.mod, go.sum, Dockerfile
```

## Component Inventory

### API Layer (cmd/server/main.go)
Main HTTP server that initializes all components, sets up routing, and starts the HTTP service. Configures middleware for CORS, authentication, logging, and request validation.

### HTTP Handlers (internal/handlers)

**action.go** - Handles action and trigger endpoints for automated workflows and notifications.

**admin.go** - Administrative endpoints for system management, user management, and system monitoring.

**fx.go** - Foreign exchange rate endpoints for currency conversion and rate management.

**investment.go** - Investment management endpoints for creating, updating, and retrieving investment data.

**pending_actions.go** - AI processing queue endpoints for managing pending actions from the AI service.

**price.go** - Asset price management endpoints for retrieving and updating asset prices.

**reporting.go** - Financial reporting endpoints for generating P&L, cashflow, and other financial reports.

**transaction.go** - Transaction management endpoints for CRUD operations on transactions.

**vault.go** - Vault management endpoints for digital asset vault operations and management.

### Service Layer (internal/services)

**transaction_service.go** - Core business logic for transaction processing, validation, and orchestration.

**investment_service.go** - Investment management logic including portfolio tracking and performance calculations.

**reporting_service.go** - Financial reporting engine with P&L calculation, cashflow analysis, and asset allocation reporting.

**fx_service.go** - Foreign exchange rate management with caching and historical data tracking.

**asset_price_service.go** - Asset price management with real-time updates and historical tracking.

**ai_pending_action_service.go** - Manages AI processing queue for text and image processing requests.

### Repository Layer (internal/repositories)

**transaction_repository.go** - Data access layer for transactions with database operations and queries.

**investment_repository.go** - Data access layer for investment data and portfolio information.

**reporting_repository.go** - Data access layer optimized for reporting queries and aggregations.

**ai_pending_action_repository.go** - Data access layer for AI processing queue management.

### Model Layer (internal/models)

**transaction.go** - Transaction entity with related structures for amounts, categories, and metadata.

**investment.go** - Investment entity with portfolio, holdings, and performance tracking structures.

**reporting.go** - Data structures for financial reports, charts, and analytics.

**asset_price.go** - Asset price entities with timestamp, source, and market data.

### Infrastructure (internal/db, internal/errors, internal/logger)

**connection.go** - Database connection management with connection pooling, transactions, and health checks.

**errors.go** - Custom error types with HTTP status code mapping and structured error responses.

**logger.go** - Structured logging configuration with zap integration and contextual logging.

## Key Dependencies
- **github.com/gin-gonic/gin**: HTTP web framework
- **gorm.io/gorm**: ORM for database operations
- **lib/pq**: PostgreSQL driver
- **go.uber.org/zap**: Structured logging
- **github.com/swaggo/gin-swagger**: API documentation
- **github.com/joho/godotenv**: Environment configuration

## Database Design
- **PostgreSQL** as primary database
- **GORM** for ORM and migrations
- **Connection pooling** and transaction management
- **Indexes** optimized for reporting and transaction queries

## External Integrations
- **PostgreSQL database** for persistence
- **FX rate providers** for currency conversion
- **Asset price APIs** for real-time market data
- **AI service** for intelligent processing

## Data Flow
1. HTTP requests hit handlers
2. Handlers validate and delegate to services
3. Services implement business logic using repositories
4. Repositories perform database operations
5. Responses flow back through service and handler layers
6. Responses are transformed and returned as JSON