# AI Service

Telegram bot service for AI-powered transaction processing using vision and language models.

## Structure

- **`src/api/`** - HTTP API layer with health checks and backend integration
- **`src/core/`** - Transaction parsing, context management, and validation
- **`src/integrations/`** - Telegram, OpenAI, and Anthropic API connections
- **`src/utils/`** - Configuration, logging, error handling, and retry logic
- **`tests/`** - Unit and integration tests

## Key Features

Receipt image analysis, natural language transaction extraction, context-aware processing, secure backend communication via HMAC-signed requests.
