# Nami - Transaction Tracking System

Comprehensive financial transaction tracking system with dual-currency valuation (USD/VND), built with Go backend and React frontend.

## Project Structure

- **`backend/`** - Go API server with PostgreSQL and comprehensive business logic
- **`frontend/`** - React web application with Tailwind CSS
- **`ai-service/`** - Telegram bot service for AI-powered transaction processing
- **`docs/`** - Architecture and development documentation

## Quick Start

```bash
make setup      # Development environment setup
make dev        # Start all services
make test       # Run all tests
```

## CI/CD

Full CI/CD pipeline with automated testing, security scanning, and cross-platform builds. See [CI Documentation](docs/ci-setup.md).
