# Business Logic Layer

Core business services implementing transaction processing, reporting, and system workflows.

## Components

- **`transaction_service.go`** - Transaction processing logic and validation
- **`admin_service.go`** - Administrative operations and configuration management
- **`reporting_service.go`** - Financial reporting engine and analytics
- **`investment_service.go`** - Investment portfolio management and calculations
- **`fx_http.go`** - Foreign exchange rate HTTP client and integration
- **`fx_cache.go`** - FX rate caching and management
- **`asset_price_service.go`** - Asset price management and caching
- **`crypto_price_provider.go`** - Cryptocurrency price feed integration
- **`ai_pending_action_service.go`** - AI processing queue management
- **`interfaces.go`** - Service interface definitions and contracts

Implements business rules, workflow orchestration, and coordinates between repositories and external data providers.