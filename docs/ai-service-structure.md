# AI Service Structure

## Purpose
The AI service is a Node.js/TypeScript microservice that handles AI-powered text and image processing, integrates with Large Language Models (LLMs), and provides Telegram bot functionality. It serves as the intelligent layer for processing user inputs and generating responses.

## Architecture Overview
The service follows a modular architecture with clear separation of concerns:
- **Core Processing**: Text parsing, data validation, and context management
- **Integrations**: LLM providers, Telegram bot, and vision processing
- **API Layer**: HTTP endpoints and backend communication
- **Utilities**: Configuration, logging, error handling, and retry logic
- **Testing**: Comprehensive unit and integration test coverage

## Folder Structure

```
ai-service/
├── src/                     # Source code
│   ├── index.ts            # Main entry point and server initialization
│   ├── api/                # API layer
│   │   ├── health.ts       # Health check endpoints
│   │   ├── backendClient.ts # HTTP client for backend communication
│   │   └── api-test.ts     # API testing utilities
│   ├── core/               # Core processing logic
│   │   ├── parser.ts       # Text parsing and formatting
│   │   ├── grounding.ts    # Context and grounding logic
│   │   └── schemas.ts      # Data validation schemas
│   ├── integrations/       # External service integrations
│   │   ├── llm.ts          # Large Language Model integration
│   │   ├── telegram.ts     # Telegram bot implementation
│   │   └── vision.ts       # Image and vision processing
│   └── utils/              # Infrastructure utilities
│       ├── config.ts       # Environment configuration and settings
│       ├── logger.ts       # Logging configuration and utilities
│       ├── errors.ts       # Custom error types and handling
│       └── retry.ts        # Retry logic for resilient operations
├── tests/                  # Test files
│   ├── unit/               # Unit tests for individual components
│   ├── integration/        # Integration tests for end-to-end functionality
│   ├── helpers/            # Test helpers and mocks
│   ├── setup.ts            # Test setup configuration
│   └── global.d.ts         # Global type definitions
├── dist/                   # Compiled JavaScript output
├── scripts/                # Build and deployment scripts
└── Configuration files     # package.json, tsconfig.json, etc.
```

## Component Inventory

### Core Components

**index.ts** - Main application entry point that initializes Express server, sets up middleware, configures routes, and starts the HTTP service. Handles graceful startup and shutdown.

**api/backendClient.ts** - HTTP client for communicating with the main backend service. Handles authentication, request/response transformation, and error handling for API calls.

**api/health.ts** - Health check endpoints for monitoring service status. Provides liveness and readiness probes for container orchestration and load balancing.

**api/api-test.ts** - Testing utilities for API endpoints. Provides helpers for making test requests, mocking responses, and validating API behavior.

### Core Processing

**core/parser.ts** - Text parsing and formatting utilities. Extracts structured data from natural language inputs, validates formats, and transforms between different data representations.

**core/grounding.ts** - Context management and grounding logic. Maintains conversation context, retrieves relevant data, and ensures responses are grounded in available information.

**core/schemas.ts** - Data validation schemas using Zod. Defines TypeScript interfaces and runtime validation for API requests, responses, and internal data structures.

### Integrations

**integrations/llm.ts** - Large Language Model abstraction layer supporting multiple providers (OpenAI, Anthropic). Handles text generation, chat completions, and provider-specific API interactions with unified interface.

**integrations/telegram.ts** - Telegram bot implementation using Telegraf framework. Processes incoming messages, commands, and media. Routes requests to appropriate handlers and formats responses.

**integrations/vision.ts** - Image processing and computer vision capabilities. Integrates with vision models to analyze images, extract text, and generate image descriptions for context-aware processing.

### Utilities

**utils/config.ts** - Centralized configuration management using environment variables. Defines settings for LLM providers, database connections, Telegram bot tokens, and service ports.

**utils/logger.ts** - Structured logging using Pino. Configures log levels, output formats, and provides logging utilities across the service.

**utils/errors.ts** - Custom error types and error handling utilities. Defines specific error classes for different failure scenarios and standardized error responses.

**utils/retry.ts** - Resilient operation handling with exponential backoff. Implements retry logic for external API calls and database operations with configurable policies.

## Key Dependencies
- **@anthropic-ai/sdk**: Anthropic Claude API integration
- **openai**: OpenAI API integration
- **telegraf**: Telegram bot framework
- **express**: HTTP server framework
- **zod**: Runtime type validation
- **pino**: Structured logging

## External Integrations
- Backend API via HTTP client
- Telegram Bot API
- OpenAI API (GPT models, DALL-E, vision)
- Anthropic Claude API

## Data Flow
1. User sends message to Telegram bot
2. telegram.ts receives and processes message
3. parser.ts extracts structured data
4. llm.ts generates appropriate response using context
5. backendClient.ts communicates with main backend as needed
6. Response formatted and sent back via Telegram