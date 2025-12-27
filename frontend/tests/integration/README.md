# Frontend Integration Tests

This directory contains comprehensive integration tests for the Nami frontend vault system, focusing on end-to-end communication with the backend.

## Overview

The frontend integration tests verify:

1. **API Communication**: Frontend can correctly communicate with backend APIs
2. **Data Serialization**: Proper serialization/deserialization of data types
3. **State Management**: Frontend state correctly reflects backend responses
4. **Error Handling**: Appropriate error handling and user feedback
5. **Transaction Processing**: End-to-end transaction workflows
6. **Data Consistency**: Frontend and backend maintain consistent state
7. **Decimal Precision**: Accurate handling of financial values

## Test Structure

### Main Test File: vault-integration.test.ts

The test file uses Vitest and Axios to test:

- **Vault CRUD Operations**: Create, read, update operations
- **Vault Shares**: User share management
- **Vault Transactions**: Transaction creation and retrieval
- **Reporting**: Summary and reporting endpoints
- **Error Handling**: Error responses and validation
- **Data Consistency**: Ledger correctness verification
- **Immutability**: Transaction immutability enforcement
- **Precision**: Decimal precision in financial calculations

## Test Categories

### 1. Vault CRUD Operations

Tests basic vault management:

```typescript
it('should create a vault', async () => {
  const response = await client.post('/api/vaults', vaultData);
  expect(response.status).toBe(201);
  expect(response.data.id).toBeDefined();
});
```

**Tests**:
- Create vault
- Retrieve vault by ID
- List all vaults
- Update vault

### 2. Vault Share Operations

Tests user share management:

```typescript
it('should create a vault share', async () => {
  const response = await client.post('/api/vault-shares', shareData);
  expect(response.status).toBe(201);
});
```

**Tests**:
- Create vault share
- Retrieve user vault shares
- Retrieve vault shares for specific vault

### 3. Vault Transaction Operations

Tests transaction processing:

```typescript
it('should create a deposit transaction', async () => {
  const response = await client.post('/api/vault-transactions', transactionData);
  expect(response.status).toBe(201);
  expect(response.data.type).toBe('deposit');
});
```

**Tests**:
- Create deposit transaction
- Create yield transaction
- Create fee transaction
- Retrieve vault transactions
- Retrieve user transactions

### 4. Vault Summary and Reporting

Tests reporting endpoints:

```typescript
it('should retrieve vault summary', async () => {
  const response = await client.get(`/api/vaults/${testVaultId}/summary`);
  expect(response.data.total_aum).toBeDefined();
});
```

**Tests**:
- Vault summary
- User vault summary
- Transaction summary

### 5. Error Handling

Tests error responses:

```typescript
it('should return 404 for non-existent vault', async () => {
  try {
    await client.get('/api/vaults/non-existent-id');
  } catch (error) {
    expect(error.response.status).toBe(404);
  }
});
```

**Tests**:
- 404 for non-existent resources
- 400 for invalid data
- Proper error messages

### 6. Data Consistency

Tests consistency between frontend and backend:

```typescript
it('should maintain consistency between deposit and share creation', async () => {
  // Create deposit
  await client.post('/api/vault-transactions', depositData);
  
  // Verify shares were created
  const shares = await client.get(`/api/users/${userId}/vault-shares`);
  expect(shares.data.length).toBeGreaterThan(0);
});
```

**Tests**:
- Deposit creates shares
- AUM calculation correctness
- Transaction consistency

### 7. Transaction Immutability

Tests immutability enforcement:

```typescript
it('should not allow updating a transaction', async () => {
  try {
    await client.patch(`/api/vault-transactions/${txId}`, updateData);
  } catch (error) {
    expect(error.response.status).toBe(405);
  }
});
```

**Tests**:
- Cannot update transactions
- Cannot delete transactions
- Proper error responses

### 8. Decimal Precision

Tests financial precision:

```typescript
it('should preserve decimal precision in amounts', async () => {
  const preciseAmount = '1234.56789';
  const response = await client.post('/api/vault-transactions', {
    amount_usd: preciseAmount,
    // ...
  });
  expect(response.data.amount_usd).toBe(preciseAmount);
});
```

**Tests**:
- Amount precision
- Price precision
- Quantity precision

## Running Tests

### Prerequisites

1. Backend server running (default: http://localhost:8080)
2. Database with migrations applied
3. Node.js 16+ installed
4. Dependencies installed: `npm install`

### Run All Tests

```bash
cd frontend
npm run test:integration
```

### Run Specific Test Suite

```bash
npm run test:integration -- --grep "Vault CRUD Operations"
```

### Run with Coverage

```bash
npm run test:integration -- --coverage
```

### Run with Watch Mode

```bash
npm run test:integration -- --watch
```

### Run with UI

```bash
npm run test:integration -- --ui
```

## Configuration

### Environment Variables

Set the backend URL:

```bash
export BACKEND_URL=http://localhost:8080
```

Or in `.env.test`:

```
BACKEND_URL=http://localhost:8080
```

### Axios Configuration

The tests use Axios with default configuration:

```typescript
const client = axios.create({
  baseURL: process.env.BACKEND_URL || 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

## Test Data

### Test User IDs

- `test-user-integration-001`: Main test user
- `test-user-consistency-001`: Consistency testing
- `test-user-aum-001`, `test-user-aum-002`: AUM calculation testing

### Test Vault Types

- `single_asset`: Single asset vault (BTC, ETH)
- `multi_asset`: Multi-asset portfolio
- `yield_farming`: Yield farming vault

## Debugging Tests

### Enable Verbose Output

```bash
npm run test:integration -- --reporter=verbose
```

### Print HTTP Requests

Add logging to Axios:

```typescript
client.interceptors.request.use(config => {
  console.log('Request:', config.method?.toUpperCase(), config.url);
  return config;
});
```

### Run Single Test

```bash
npm run test:integration -- --grep "should create a vault"
```

### Increase Timeout

```bash
npm run test:integration -- --testTimeout=30000
```

## Common Issues

### Connection Refused

**Issue**: `ECONNREFUSED: Connection refused`

**Solution**: Ensure backend is running on the configured URL.

### 404 Errors

**Issue**: Tests return 404 for valid endpoints

**Solution**: Check that backend is running and migrations are applied.

### Decimal Precision Loss

**Issue**: Decimal values are rounded or truncated

**Solution**: Ensure backend returns values as strings, not numbers.

### Timeout Issues

**Issue**: Tests timeout waiting for responses

**Solution**: Increase timeout or check backend performance.

## Best Practices

### 1. Use Descriptive Test Names

```typescript
it('should create a vault with all required fields', async () => {
  // ...
});
```

### 2. Test Both Success and Failure Cases

```typescript
it('should create a vault', async () => { /* success */ });
it('should return 400 for invalid vault data', async () => { /* failure */ });
```

### 3. Verify Response Structure

```typescript
expect(response.data).toBeDefined();
expect(response.data.id).toBeDefined();
expect(response.data.name).toBe(expectedName);
```

### 4. Test Edge Cases

```typescript
it('should handle very large amounts', async () => { /* ... */ });
it('should handle very small amounts', async () => { /* ... */ });
```

### 5. Clean Up Test Data

```typescript
afterAll(() => {
  // Cleanup if needed
});
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run Frontend Integration Tests
  run: |
    cd frontend
    npm install
    npm run test:integration
  env:
    BACKEND_URL: http://localhost:8080
```

## Performance Testing

### Load Testing

For load testing, consider using tools like:
- Apache JMeter
- k6
- Locust

### Example k6 Script

```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  let res = http.get('http://localhost:8080/api/vaults');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
```

## Related Documentation

- [Backend Integration Tests](../backend/tests/integration/README.md)
- [API Documentation](../../docs/api.md)
- [Frontend Architecture](../../docs/frontend-structure.md)

## Troubleshooting

### Tests Pass Locally but Fail in CI

**Possible Causes**:
- Different database state
- Timing issues
- Environment variable differences

**Solutions**:
- Use test fixtures
- Add explicit waits
- Check environment configuration

### Flaky Tests

**Possible Causes**:
- Race conditions
- Timing dependencies
- Database state issues

**Solutions**:
- Add explicit waits
- Use database transactions
- Increase timeouts

### Memory Leaks

**Possible Causes**:
- Unclosed connections
- Event listeners not removed

**Solutions**:
- Properly close connections
- Clean up in afterAll
- Use connection pooling





