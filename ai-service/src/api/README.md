# API Layer

HTTP API for external communications and service monitoring.

## Components

- **`health.ts`** - Health checks and service status
- **`backendClient.ts`** - Secure HTTP client with HMAC authentication
- **`api-test.ts`** - Testing utilities for API validation

## Endpoints

- `GET /healthz` - Comprehensive health status
- `GET /ready` - Readiness probe
- `POST /telegram/webhook` - Telegram bot webhook

Handles request validation, HMAC authentication, and structured error responses.
