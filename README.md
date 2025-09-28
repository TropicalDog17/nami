# Nami - Transaction Tracking System

A comprehensive financial transaction tracking system with dual-currency valuation (USD/VND), built with Go backend and React frontend.

## Features

- **Comprehensive Transaction Tracking**: Support for 17+ transaction types (buy, sell, expense, income, etc.)
- **Dual Currency Valuation**: All transactions valued in both USD and VND with FX rate tracking
- **Credit Card Flow Support**: Two-step credit card transactions (expense → repay_borrow)
- **Admin Interface**: Configurable transaction types with full audit trail
- **Rich Reporting**: Holdings, cash flow, spending analysis, and P&L reporting
- **Master Data Management**: Accounts, assets, tags with categorization

## Architecture

### Backend (Go)

- **Database**: PostgreSQL with decimal precision for financial data
- **ORM**: Raw SQL with connection pooling
- **Architecture**: Interface-first design with service layer pattern
- **Validation**: Comprehensive input validation and derived field calculations

### Frontend (React)

- **Build Tool**: Vite for fast development and builds
- **Styling**: Tailwind CSS for modern UI
- **State Management**: React Context and custom hooks
- **Routing**: React Router for client-side navigation

## Project Structure

```
nami/
├── backend/
│   ├── cmd/server/              # Main server application
│   ├── internal/
│   │   ├── db/                  # Database connection and utilities
│   │   ├── models/              # Data models and business logic
│   │   ├── services/            # Service layer implementations
│   │   ├── handlers/            # HTTP handlers (API endpoints)
│   │   └── middleware/          # HTTP middleware
│   └── tests/                   # Test files
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/              # Page components
│   │   ├── services/           # API clients
│   │   ├── hooks/              # Custom React hooks
│   │   └── context/            # React context providers
│   └── public/                 # Static assets
├── migrations/                  # Database migration files
└── docs/                       # Documentation
```

## Database Schema

### Core Tables

- **transactions**: Main transaction records with derived metrics
- **transaction_types**: Admin-configurable transaction categories
- **transaction_type_audit**: Audit trail for type changes
- **accounts**: Asset holding locations (Cash, Bank, Exchange, etc.)
- **assets**: Currencies and tokens with metadata
- **tags**: Categorization tags for reporting
- **fx_rates**: Foreign exchange rate cache

### Key Features

- UUID primary keys for transactions
- Decimal precision for financial calculations
- Comprehensive indexing for performance
- Audit trails with JSONB change tracking
- Soft deletes for data integrity

## Development Setup

### Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL 15+
- Docker (optional, for PostgreSQL)

### Backend Setup

```bash
cd backend
go mod download
go run migrations/migrate.go  # Run database migrations
go run cmd/server/main.go     # Start the server
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev                   # Start development server
```

### Database Setup (Docker)

```bash
docker-compose up -d          # Start PostgreSQL container
```

## API Endpoints

### Transactions

- `POST /api/transactions` - Create transaction
- `GET /api/transactions/:id` - Get transaction
- `GET /api/transactions` - List transactions (with filters)
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Admin

- `GET /api/admin/types` - List transaction types
- `POST /api/admin/types` - Create transaction type
- `PUT /api/admin/types/:id` - Update transaction type
- `DELETE /api/admin/types/:id` - Delete transaction type
- `GET /api/admin/types/:id/audit` - Get audit trail

### Reporting

- `GET /api/reports/holdings` - Holdings report
- `GET /api/reports/cashflow` - Cash flow report
- `GET /api/reports/spending` - Spending report
- `GET /api/reports/pnl` - P&L report

## Transaction Types

The system supports the following transaction types (admin configurable):

- **buy**: Purchase of an asset
- **sell**: Sale of an asset
- **deposit**: Deposit into account or LP
- **withdraw**: Withdrawal from account or LP
- **transfer_in**: Transfer into account
- **transfer_out**: Transfer out of account
- **expense**: Expense or spending
- **income**: Income or earnings
- **reward**: Rewards or cashback
- **airdrop**: Token airdrop
- **fee**: Transaction or service fee
- **lend**: Lending transaction
- **repay**: Loan repayment received
- **interest**: Interest income
- **borrow**: Borrowing transaction
- **repay_borrow**: Loan repayment made
- **interest_expense**: Interest expense paid

## Derived Field Calculations

The system automatically calculates derived fields:

- **ΔQty**: Change in asset quantity based on transaction type
- **CashFlowUSD/VND**: Signed cash flow impact
- **AmountUSD/VND**: Dual currency valuation using FX rates

## Quick Start Demo

### Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL 15+ (or Docker)

### Demo Setup (2 minutes)

```bash
# One-command demo setup
./demo.sh

# Or individual components:
./demo.sh backend   # Start backend only
./demo.sh frontend  # Start frontend only
./demo.sh test      # Run tests (requires backend + frontend running)

# Manual setup:
# 1. Start services
docker-compose up -d
cd migrations && go run migrate.go && cd ..

# 2. Start backend and frontend
cd backend && go run cmd/server/main.go &
cd ../frontend && npm install && npm run dev &
```

### Testing

```bash
# Run all tests (requires backend and frontend running)
./run_tests.sh

# Or run specific tests
cd frontend && npx playwright test --headed  # Run with visible browser
```

### Demo Workflow

1. **Admin Setup**: Configure transaction types, accounts, and assets
2. **Transaction Entry**: Add buy/sell transactions with dual currency valuation
3. **Reporting**: View holdings, cash flow, and P&L reports
4. **Data Management**: Full CRUD operations with audit trails

## Implementation Status

### Completed ✅

- [x] Project structure and build setup
- [x] Database schema with migrations and seed data
- [x] Core data models with validation and derived fields
- [x] Service layer interfaces and implementations
- [x] TransactionService with full CRUD operations
- [x] AdminService with audit logging and master data management
- [x] ReportingService with holdings, cash flow, and P&L reports
- [x] HTTP handlers and REST API endpoints
- [x] React frontend with modern UI components
- [x] Dual currency valuation (USD/VND) with FX rate caching
- [x] FX provider integration (HTTP API with caching)
- [x] Database connection pooling and transaction management
- [x] Environment configuration and error handling
- [x] End-to-end testing suite (Playwright)
- [x] Docker containerization support

### Production Ready Features 🚀

- [x] Input validation and error handling
- [x] Audit trails for all data changes
- [x] Soft deletes for data integrity
- [x] Comprehensive indexing for performance
- [x] Decimal precision for financial calculations
- [x] Responsive UI with Tailwind CSS
- [x] Offline resilience and connectivity handling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
