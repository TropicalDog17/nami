# Testing Guide

## Test Modes

The AI Service supports two testing modes for LLM integration:

### 🎭 Mock Mode (Default)
- **Fast**: Tests complete in ~5-10 seconds
- **No Cost**: No API credits consumed
- **No Dependencies**: No network calls required
- **Use Case**: CI/CD, development, unit testing

**Configuration**:
```bash
# Set to mock-key or leave unset
TEST_ANTHROPIC_KEY=mock-key
# OR simply don't set the variable at all
```

### 🌐 Real API Mode
- **Comprehensive**: Tests actual LLM responses and parsing
- **Slower**: Tests take ~30+ seconds due to network calls
- **Cost**: Consumes real API credits
- **Use Case**: Integration testing, prompt engineering validation

**Configuration**:
```bash
# Set to your real Anthropic API key
TEST_ANTHROPIC_KEY=sk-ant-your-real-api-key-here
```

## Running Tests

### Mock Mode (Recommended for CI/CD)
```bash
# Uses mock mode by default
npm test

# Or explicitly set mock mode
TEST_ANTHROPIC_KEY=mock-key npm test
```

### Real API Mode
```bash
# Set your real API key
export TEST_ANTHROPIC_KEY=sk-ant-your-real-api-key-here
npm test

# Or set inline
TEST_ANTHROPIC_KEY=sk-ant-your-real-api-key-here npm test
```

## Test Categories

### Unit Tests (`tests/unit/`)
- **Mock Only**: Fast, no external dependencies
- **Coverage**: Business logic, error handling, retry logic
- **Runtime**: ~1-2 seconds

### Integration Tests (`tests/integration/`)
- **Mock Only**: Mock LLM and backend services
- **Coverage**: End-to-end flows, TOON parsing
- **Runtime**: ~2-5 seconds

### LLM Integration Tests (`tests/llm.integration.test.ts`)
- **Dual Mode**: Mock or Real API based on `TEST_ANTHROPIC_KEY`
- **Coverage**: LLM responses, token usage, error handling
- **Runtime**: Mock ~2s, Real ~25 seconds

## Environment Variables

```bash
# Production/Service Environment
ANTHROPIC_API_KEY=sk-ant-your-production-key
ANTHROPIC_AUTH_TOKEN=your-proxy-token
ANTHROPIC_BASE_URL=https://api.anthropic.com

# Testing Environment
TEST_ANTHROPIC_KEY=mock-key              # Mock mode (default)
TEST_ANTHROPIC_KEY=sk-ant-your-key      # Real API mode
```

## Best Practices

1. **CI/CD Pipelines**: Always use mock mode (`TEST_ANTHROPIC_KEY=mock-key`)
2. **Local Development**: Use mock mode for speed, real mode for validation
3. **Prompt Engineering**: Use real mode to test actual LLM responses
4. **Before Releases**: Run real API mode to validate integration
5. **Cost Management**: Monitor API usage when using real mode

## Mock Responses

When in mock mode, tests use predefined responses:

**Basic Chat**: `"LLM test successful"`
**Expense Parsing**: Structured TOON format responses
**Error Handling**: Simulated network timeouts and auth errors

## Troubleshooting

### Tests Fail in Real API Mode
1. Check API key validity
2. Verify network connectivity
3. Check API rate limits
4. Confirm credit availability

### Tests Always Use Mock Mode
1. Verify `TEST_ANTHROPIC_KEY` is set correctly
2. Ensure it's not set to `mock-key`
3. Check environment variable export

### Slow Test Performance
1. Use mock mode for development
2. Run specific test files instead of full suite
3. Consider test parallelization for real API mode