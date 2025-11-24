# Nami AI Service

Intelligent Telegram bot service for processing financial transactions using AI vision and language models.

## Key Components

- **`src/index.ts`** - Main application entry point and server initialization
- **`src/api/`** - HTTP API layer with health checks and backend integration
- **`src/core/`** - Transaction processing, parsing, and grounding logic
- **`src/integrations/`** - Telegram, OpenAI, and Anthropic API connections
- **`src/utils/`** - Configuration, logging, error handling, and retry utilities
- **`tests/`** - Unit and integration tests with mocking utilities

## Configuration

Environment variables defined in `.env.example` for Telegram bot tokens, AI provider API keys, backend integration, and service settings.

Integrates with the main Nami backend API via HMAC-signed requests for secure transaction submission.