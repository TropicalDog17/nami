# API Layer

HTTP API layer for external communications and service monitoring.

## Components

- **`health.ts`** - Health checks for service status, backend connectivity, and AI providers
- **`backendClient.ts`** - Secure HTTP client with HMAC authentication for backend integration
- **`api-test.ts`** - Testing utilities for API validation and connectivity

## Endpoints

- `GET /healthz` - Comprehensive health status
- `GET /ready` - Readiness probe
- `POST /telegram/webhook` - Telegram bot webhook
- `GET /api/test/*` - Testing endpoints

Handles request validation, HMAC authentication, and structured error responses.