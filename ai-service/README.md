# Nami AI Service

An intelligent expense parsing service that integrates with Telegram to process text messages and bank screenshots using AI vision and language models.

## Features

- **Text Expense Parsing**: Parse natural language expense descriptions into structured data
- **Vision Analysis**: Extract transaction data from bank screenshots using GPT-4 Vision
- **Telegram Integration**: Bot interface for easy expense submission
- **Retry Logic**: Resilient API calls with exponential backoff
- **Health Monitoring**: Comprehensive health checks and metrics
- **Structured Logging**: Correlation ID tracking for debugging
- **Error Handling**: Categorized errors with appropriate user feedback

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│  Telegram   │────▶│ AI Service   │────▶│  OpenAI     │────▶│   Vision    │
│   Bot       │     │   (Node.js)  │     │   API       │     │  Analysis   │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                   ┌──────────────┐
                   │   Backend    │
                   │   (Go API)   │
                   └──────────────┘
```

## Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key with GPT-4 Vision access
- Telegram Bot Token
- Backend API URL and signing secret

## Quick Start

### 1. Clone and Install

```bash
cd ai-service
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=sk-your_openai_api_key
BACKEND_BASE_URL=http://localhost:3000
BACKEND_SIGNING_SECRET=your_16_char_minimum_secret
SERVICE_BASE_URL=http://localhost:8081

# Optional
PORT=8081
ALLOWED_CHAT_IDS=123456789,987654321
DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
LOG_LEVEL=info
TELEGRAM_WEBHOOK_MODE=false
TELEGRAM_DRY_RUN=false
NODE_ENV=development
```

### 3. Development Setup

```bash
# Start development server with hot reload
npm run dev

# Or build and run
npm run build
npm start
```

### 4. Verify Installation

```bash
# Health check
curl http://localhost:8081/healthz

# Readiness check
curl http://localhost:8081/ready

# Metrics
curl http://localhost:8081/metrics
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Telegram bot token from BotFather |
| `OPENAI_API_KEY` | ✅ | - | OpenAI API key (needs GPT-4 Vision access) |
| `BACKEND_BASE_URL` | ✅ | - | Backend API base URL |
| `BACKEND_SIGNING_SECRET` | ✅ | - | HMAC secret for backend API authentication (min 16 chars) |
| `SERVICE_BASE_URL` | ✅ | - | This service's public URL for webhooks |
| `PORT` | ❌ | 8081 | Port for the service to listen on |
| `ALLOWED_CHAT_IDS` | ❌ | "" | Comma-separated list of allowed Telegram chat IDs |
| `DEFAULT_TIMEZONE` | ❌ | Asia/Ho_Chi_Minh | Default timezone for date parsing |
| `LOG_LEVEL` | ❌ | info | Logging level (debug, info, warn, error) |
| `TELEGRAM_WEBHOOK_MODE` | ❌ | false | Set to 'true' to use webhook mode instead of polling |
| `TELEGRAM_DRY_RUN` | ❌ | false | Set to 'true' to prevent actual API calls (for testing) |
| `NODE_ENV` | ❌ | development | Environment (development, production) |

### Telegram Bot Setup

1. **Create Bot**: Talk to [@BotFather](https://t.me/BotFather) on Telegram
   - `/newbot` - Create a new bot
   - Set a name and username
   - Get the bot token

2. **Configure Bot**:
   - Set privacy mode: `/setprivacy` → Disable (to receive all messages)
   - Enable inline mode if needed: `/setinline`

3. **Get Chat ID**:
   - Start a chat with your bot
   - Send any message
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Find your `chat.id` in the response

### OpenAI API Setup

1. **Get API Key**:
   - Go to [OpenAI Platform](https://platform.openai.com/)
   - Create an API key
   - Ensure your account has GPT-4 Vision access

2. **Test Vision Access**:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     | grep gpt-4
   ```

## Deployment

### Docker Deployment

1. **Build Image**:
   ```bash
   docker build -t nami-ai-service .
   ```

2. **Run Container**:
   ```bash
   docker run -d \
     --name nami-ai-service \
     -p 8081:8081 \
     --env-file .env \
     nami-ai-service
   ```

### Docker Compose

```yaml
version: '3.8'
services:
  ai-service:
    build: .
    ports:
      - "8081:8081"
    environment:
      - NODE_ENV=production
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - BACKEND_BASE_URL=${BACKEND_BASE_URL}
      - BACKEND_SIGNING_SECRET=${BACKEND_SIGNING_SECRET}
      - SERVICE_BASE_URL=${SERVICE_BASE_URL}
      - ALLOWED_CHAT_IDS=${ALLOWED_CHAT_IDS}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Production Considerations

1. **Security**:
   - Use HTTPS for webhook URLs
   - Keep API keys secure (use secrets management)
   - Limit allowed chat IDs
   - Monitor for unusual activity

2. **Performance**:
   - Set appropriate timeouts
   - Monitor rate limits
   - Use caching for grounding data
   - Scale horizontally if needed

3. **Monitoring**:
   - Enable health checks
   - Monitor logs for errors
   - Track metrics via `/metrics` endpoint
   - Set up alerting for failures

## API Reference

### Health Endpoints

#### GET /healthz
Comprehensive health check with component status.

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "checks": {
    "backend": {
      "status": "healthy",
      "latency": 45
    },
    "openai": {
      "status": "healthy",
      "latency": 123
    },
    "grounding": {
      "status": "healthy",
      "age": 120000,
      "accounts": 5,
      "tags": 12
    },
    "config": {
      "status": "healthy"
    }
  },
  "summary": {
    "total": 4,
    "healthy": 4,
    "degraded": 0,
    "unhealthy": 0
  }
}
```

#### GET /ready
Simple readiness probe.

```json
{
  "ready": true,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

#### GET /metrics
Basic service metrics.

```json
{
  "uptime": 3600.5,
  "memory": {
    "rss": 50331648,
    "heapTotal": 29360128,
    "heapUsed": 20971520,
    "external": 1048576
  },
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### Telegram Webhook

#### POST /telegram/webhook
Receives updates from Telegram. The endpoint expects HMAC-signed requests from Telegram.

## Usage Examples

### Text Messages

Send natural language expense descriptions:

```
Lunch 120k at McDo from Bank today
Coffee 45k Highlands from Cash yesterday
Groceries 500k Big C from Visa on 2025-01-01
```

### Bank Screenshots

Send bank screenshots with optional captions:

```
[Bank screenshot image]
Vietcombank transactions this month
```

### Supported Formats

**Text**: `Description amount from account [date] [at merchant]`
- Amount: Support "k" for thousand (e.g., "120k" = 120,000)
- Account: Must be from configured accounts list
- Date: Defaults to today, supports YYYY-MM-DD format
- Merchant: Optional counterparty information

**Images**: Bank statement screenshots with transaction tables
- Supports most Vietnamese bank apps
- Extracts date, description, amount, and reference
- Handles multiple transaction formats

## Development

### Project Structure

```
src/
├── config.ts          # Configuration loading and validation
├── logger.ts           # Structured logging with correlation IDs
├── errors.ts           # Error categorization and handling
├── retry.ts            # Retry logic with exponential backoff
├── health.ts           # Health checking implementation
├── backendClient.ts    # Backend API client with retry logic
├── grounding.ts        # Grounding data caching
├── telegram.ts         # Telegram bot implementation
├── parser.ts           # Text parsing with OpenAI
├── vision.ts           # Image analysis with OpenAI Vision
├── schemas.ts          # Type definitions and schemas
└── index.ts            # Main application entry point

tests/
├── integration/        # End-to-end integration tests
└── unit/              # Unit tests for individual modules
```

### Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Build for production
npm start            # Start production build

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode

# Type checking
npm run check        # TypeScript type checking
npm run lint         # ESLint checking
```

### Adding New Features

1. **Create Module**: Add new functionality in `src/`
2. **Add Types**: Define interfaces in `src/schemas.ts`
3. **Update Tests**: Add unit and integration tests
4. **Update Config**: Add any new environment variables
5. **Documentation**: Update this README

## Troubleshooting

### Common Issues

**Bot not responding**:
- Check `TELEGRAM_BOT_TOKEN` is correct
- Verify `ALLOWED_CHAT_IDS` includes your chat ID
- Check bot privacy mode is disabled
- Review logs for error messages

**OpenAI API errors**:
- Verify `OPENAI_API_KEY` is valid
- Check GPT-4 Vision access is enabled
- Monitor rate limits and quotas
- Review billing status

**Backend connection issues**:
- Verify `BACKEND_BASE_URL` is accessible
- Check `BACKEND_SIGNING_SECRET` matches backend
- Review network connectivity
- Check backend service health

**Image parsing failures**:
- Ensure images are clear and contain transaction tables
- Check supported bank formats
- Review image size and quality
- Check OpenAI Vision API limits

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
TELEGRAM_DRY_RUN=true  # Prevent actual API calls
```

### Health Monitoring

Monitor service health:

```bash
# Continuous health check
watch -n 5 curl -s http://localhost:8081/healthz | jq .

# Check logs
docker logs -f nami-ai-service
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is proprietary software. All rights reserved.