# AI Service API Testing Examples

This document provides examples for testing the AI service API endpoints.

## Setup

Start the AI service:
```bash
cd ai-service
npm run dev
```

The service will start on `http://localhost:8081`

## API Endpoints

### 1. Health Check
```bash
curl http://localhost:8081/api/test/health
```

### 2. Get Available Providers
```bash
curl http://localhost:8081/api/test/providers
```

### 3. Test LLM Chat (Basic Text Generation)

#### OpenAI
```bash
curl -X POST http://localhost:8081/api/test/llm-chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "provider": "openai",
    "apiKey": "sk-your-openai-api-key"
  }'
```

#### Anthropic
```bash
curl -X POST http://localhost:8081/api/test/llm-chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "provider": "anthropic",
    "apiKey": "sk-ant-your-anthropic-api-key"
  }'
```

### 4. Test Expense Text Parsing

#### OpenAI
```bash
curl -X POST http://localhost:8081/api/test/text-parse \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Lunch 120k at McDonalds from Vietcombank today",
    "provider": "openai",
    "apiKey": "sk-your-openai-api-key",
    "accounts": [
      {"name": "Vietcombank", "id": "vcb"}
    ],
    "tags": [
      {"name": "Food", "id": "food"}
    ]
  }'
```

#### Anthropic
```bash
curl -X POST http://localhost:8081/api/test/text-parse \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Lunch 120k at McDonalds from Vietcombank today",
    "provider": "anthropic",
    "apiKey": "sk-ant-your-anthropic-api-key",
    "accounts": [
      {"name": "Vietcombank", "id": "vcb"}
    ],
    "tags": [
      {"name": "Food", "id": "food"}
    ]
  }'
```

### 5. Test Vision Parsing (OpenAI Only)

```bash
curl -X POST http://localhost:8081/api/test/vision-parse \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/bank-statement.jpg",
    "provider": "openai",
    "apiKey": "sk-your-openai-api-key"
  }'
```

## Testing with Different Models

### OpenAI Models
- `gpt-4o-mini` (default, recommended)
- `gpt-4o`
- `gpt-3.5-turbo`

### Anthropic Models
- `claude-3-5-haiku-20241022` (default, recommended)
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`

Example with custom model:
```bash
curl -X POST http://localhost:8081/api/test/llm-chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "provider": "anthropic",
    "apiKey": "sk-ant-your-anthropic-api-key",
    "model": "claude-3-5-sonnet-20241022"
  }'
```

## Response Format

All endpoints return responses in this format:

```json
{
  "success": true,
  "correlationId": "uuid-for-tracking",
  "provider": "openai|anthropic",
  "model": "model-used",
  "result": { ... }
}
```

Error responses:
```json
{
  "success": false,
  "correlationId": "uuid-for-tracking",
  "error": "Error message"
}
```

## Environment Variables (Optional)

If you want to avoid passing API keys in requests, you can set them as environment variables:

```bash
export OPENAI_API_KEY=sk-your-openai-key
export ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

## Testing Recommendations

1. **Start with LLM Chat**: Test basic connectivity with the llm-chat endpoint
2. **Test Text Parsing**: Try expense parsing with different message formats
3. **Compare Providers**: Test the same input with both OpenAI and Anthropic to compare results
4. **Monitor Logs**: The service provides detailed logs with correlation IDs for debugging

## Common Test Messages for Text Parsing

- "Coffee 45k at Highlands Coffee from Techcombank yesterday"
- "Grab ride 80k to office from Momo card"
- "Electricity bill 450k via ACB bank this month"
- "Grocery shopping 250k at Big C using VIB card"