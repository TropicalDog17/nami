# Nami - Transaction Tracking System

Comprehensive financial transaction tracking system with dual-currency valuation (USD/VND), built with Go backend and React frontend.

## Project Structure

- **`backend/`** - Go API server with PostgreSQL database and comprehensive business logic
- **`frontend/`** - React frontend with Tailwind CSS and modern UI components
- **`ai-service/`** - Telegram bot service for AI-powered transaction processing
- **`migrations/`** - Database schema migration files
- **`docs/`** - Project documentation

## Key Features

Supports 17+ transaction types, credit card flows, admin-configurable transaction types, holdings reporting, and FX rate tracking with decimal precision for financial calculations.

## Development

```bash
make setup      # Complete development environment setup
make dev        # Start all development servers
make test       # Run all tests
```