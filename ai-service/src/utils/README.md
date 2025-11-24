# Utility Infrastructure

Shared infrastructure components for configuration, logging, and resilience.

## Components

- **`config.ts`** - Environment variable loading and validation with type safety
- **`logger.ts`** - Structured JSON logging with correlation ID tracking
- **`errors.ts`** - Categorized error handling with severity levels
- **`retry.ts`** - Exponential backoff retry logic with circuit breaker support

Provides type-safe configuration, observability, and reliability patterns used throughout the service.