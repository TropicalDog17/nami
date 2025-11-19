# Source Directory

Main application source code for the Nami AI Service.

## Structure

- **`api/`** - HTTP API layer with health checks and backend integration
- **`core/`** - Transaction parsing, grounding, and data validation
- **`integrations/`** - Telegram, OpenAI, and Anthropic service connections
- **`utils/`** - Configuration, logging, error handling, and retry utilities
- **`index.ts`** - Application entry point and server initialization

Processes Telegram messages through AI analysis to extract structured financial transaction data for backend submission.