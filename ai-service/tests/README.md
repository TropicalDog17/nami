# Test Suite

Testing infrastructure with unit, integration, and LLM testing.

## Structure

- **`helpers/`** - Mock utilities for backend API and AI providers
- **`integration/`** - End-to-end transaction processing tests
- **`unit/`** - Component unit tests for health and retry logic
- **`llm.integration.test.ts`** - Real AI provider API testing

## Running Tests

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:llm      # LLM integration tests
```
