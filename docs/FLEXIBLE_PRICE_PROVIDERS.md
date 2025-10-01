# Flexible Price Provider Configuration

This guide explains how to add assets with custom price provider configurations that automatically populate historical prices.

## Overview

The flexible price provider system allows admins to:
1. **Configure custom API endpoints** for any price source
2. **Automatically populate historical prices** when creating an asset
3. **Track population progress** with background jobs
4. **Support any REST API** with configurable authentication and response parsing

## Key Features

- ✅ **No code changes required** - Configure everything via API/database
- ✅ **Automatic price population** - Historical prices fetched on asset creation
- ✅ **Flexible API configuration** - Support for headers, query params, auth
- ✅ **JSON path extraction** - Extract prices from any JSON response structure
- ✅ **Background jobs** - Track progress and handle failures
- ✅ **Environment variable support** - Secure API key management

---

## Quick Start

### Example 1: Add Bitcoin with CoinGecko

```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "BTC",
      "name": "Bitcoin",
      "decimals": 8,
      "is_active": true
    },
    "mapping": {
      "provider": "coingecko",
      "provider_id": "bitcoin",
      "quote_currency": "USD",
      "is_popular": true,
      "api_endpoint": "https://api.coingecko.com/api/v3/coins/{provider_id}/history?date={date_ddmmyyyy}&localization=false",
      "response_path": "market_data.current_price.{currency_lower}",
      "auto_populate": true,
      "populate_from_date": "2020-01-01"
    }
  }'
```

---

### Example 2: Custom API with Bearer Auth

```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "CUSTOM",
      "name": "Custom Asset",
      "decimals": 8,
      "is_active": true
    },
    "mapping": {
      "provider": "custom-api",
      "provider_id": "CUSTOM_ID",
      "quote_currency": "USD",
      "is_popular": false,
      "api_endpoint": "https://api.example.com/v1/prices",
      "api_config": {
        "headers": {
          "Accept": "application/json"
        },
        "query_params": {
          "symbol": "{symbol}",
          "date": "{date}",
          "currency": "{currency}"
        },
        "auth_type": "bearer",
        "auth_value": "${CUSTOM_API_TOKEN}"
      },
      "response_path": "data.price",
      "auto_populate": true,
      "populate_from_date": "2024-01-01"
    }
  }'
```

---

## Configuration Reference

### Asset Price Mapping Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset_id` | int | Yes | ID of the asset |
| `provider` | string | Yes | Provider name (e.g., "coingecko", "metals-api") |
| `provider_id` | string | Yes | Asset ID in provider's system |
| `quote_currency` | string | Yes | Base currency for prices (usually "USD") |
| `is_popular` | boolean | No | Mark as popular asset |
| `api_endpoint` | string | No | API endpoint template with placeholders |
| `api_config` | JSON | No | API configuration (headers, auth, params) |
| `response_path` | string | No | JSON path to extract price |
| `auto_populate` | boolean | No | Auto-populate on creation (default: false) |
| `populate_from_date` | date | No | Start date for population |
| `is_active` | boolean | No | Whether mapping is active (default: true) |

---

## URL Placeholders

Use these placeholders in `api_endpoint`:

| Placeholder | Example Value | Description |
|-------------|---------------|-------------|
| `{symbol}` | BTC | Asset symbol |
| `{provider_id}` | bitcoin | Provider-specific ID |
| `{currency}` | USD | Quote currency |
| `{currency_lower}` | usd | Lowercase currency |
| `{currency_upper}` | USD | Uppercase currency |
| `{date}` | 2024-01-15 | Date in YYYY-MM-DD format |
| `{date_yyyymmdd}` | 20240115 | Date in YYYYMMDD format |
| `{date_ddmmyyyy}` | 15-01-2024 | Date in DD-MM-YYYY format |
| `{date_unix}` | 1705276800 | Unix timestamp |
| `{date_yyyy}` | 2024 | Year |
| `{date_mm}` | 01 | Month |
| `{date_dd}` | 15 | Day |

---

## API Configuration

### Structure

```json
{
  "headers": {
    "Accept": "application/json",
    "Custom-Header": "value"
  },
  "query_params": {
    "param1": "value1",
    "param2": "{symbol}"
  },
  "auth_type": "bearer|apikey|none",
  "auth_value": "${ENV_VAR}",
  "method": "GET|POST"
}
```

### Authentication Types

**Bearer Token:**
```json
{
  "auth_type": "bearer",
  "auth_value": "${API_TOKEN}"
}
```
Adds header: `Authorization: Bearer <token>`

**API Key:**
```json
{
  "auth_type": "apikey",
  "auth_value": "${API_KEY}"
}
```
Adds header: `X-API-Key: <key>`

**No Auth:**
```json
{
  "auth_type": "none"
}
```

### Environment Variables

Use `${VAR_NAME}` syntax to reference environment variables:

```bash
export CUSTOM_API_TOKEN="your-token-here"
export ALPHAVANTAGE_API_KEY="your-key-here"
```

```json
{
  "query_params": {
    "apikey": "${ALPHAVANTAGE_API_KEY}"
  }
}
```

---

## Response Path

The `response_path` field uses dot notation to navigate JSON responses.

### Examples

**Simple path:**
```json
// Response: {"price": 2050.50}
"response_path": "price"
```

**Nested path:**
```json
// Response: {"data": {"price": 2050.50}}
"response_path": "data.price"
```

**With placeholders:**
```json
// Response: {"rates": {"XAU": 2050.50}}
"response_path": "rates.{provider_id}"

// Response: {"market_data": {"current_price": {"usd": 42000}}}
"response_path": "market_data.current_price.{currency_lower}"
```

---

## Price Population Jobs

### Check Job Status

```bash
curl "http://localhost:8080/api/admin/price-population/jobs?id=1"
```

**Response:**
```json
{
  "id": 1,
  "asset_id": 5,
  "mapping_id": 3,
  "status": "running",
  "start_date": "2023-01-01T00:00:00Z",
  "end_date": "2024-01-15T00:00:00Z",
  "current_date": "2023-06-15T00:00:00Z",
  "total_days": 380,
  "completed_days": 165,
  "created_at": "2024-01-15T10:00:00Z",
  "started_at": "2024-01-15T10:00:05Z"
}
```

### List Jobs for Asset

```bash
curl "http://localhost:8080/api/admin/price-population/jobs?asset_id=5"
```

### Manually Create Job

```bash
curl -X POST http://localhost:8080/api/admin/price-population/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "asset_id": 5,
    "mapping_id": 3,
    "start_date": "2024-01-01",
    "end_date": "2024-01-15"
  }'
```

---

## Common Provider Configurations

### CoinGecko (Crypto)

```json
{
  "provider": "coingecko",
  "provider_id": "bitcoin",
  "api_endpoint": "https://api.coingecko.com/api/v3/coins/{provider_id}/history?date={date_ddmmyyyy}&localization=false",
  "response_path": "market_data.current_price.{currency_lower}",
  "auto_populate": true
}
```

### Alpha Vantage (Stocks)

```json
{
  "provider": "alphavantage",
  "provider_id": "AAPL",
  "api_endpoint": "https://www.alphavantage.co/query",
  "api_config": {
    "query_params": {
      "function": "TIME_SERIES_DAILY",
      "symbol": "{provider_id}",
      "apikey": "${ALPHAVANTAGE_API_KEY}"
    }
  },
  "response_path": "Time Series (Daily).{date}.4. close",
  "auto_populate": true
}
```

---

## Database Schema

### asset_price_mappings

```sql
CREATE TABLE asset_price_mappings (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    provider VARCHAR(50) NOT NULL,
    provider_id VARCHAR(100) NOT NULL,
    quote_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_popular BOOLEAN DEFAULT FALSE,
    
    -- Flexible configuration
    api_endpoint TEXT,
    api_config JSONB DEFAULT '{}'::jsonb,
    response_path TEXT,
    auto_populate BOOLEAN DEFAULT FALSE,
    populate_from_date DATE,
    last_populated_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(asset_id, provider)
);
```

### price_population_jobs

```sql
CREATE TABLE price_population_jobs (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    mapping_id INTEGER NOT NULL REFERENCES asset_price_mappings(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    current_date DATE,
    total_days INTEGER,
    completed_days INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Best Practices

### 1. Test API Configuration First

Before enabling auto-populate, test your API configuration manually:

```bash
# Test the API endpoint directly
curl "https://metals-api.com/api/2024-01-15?access_key=YOUR_KEY&base=USD&symbols=XAU"
```

### 2. Start with Small Date Ranges

When first setting up, use a small date range:

```json
{
  "populate_from_date": "2024-01-01",  // Just 2 weeks
  "auto_populate": true
}
```

### 3. Monitor Rate Limits

Check your API provider's rate limits and adjust accordingly. The system adds a 100ms delay between requests.

### 4. Use Environment Variables for Secrets

Never hardcode API keys:

```json
// ❌ Bad
"auth_value": "sk_live_abc123"

// ✅ Good
"auth_value": "${API_KEY}"
```

### 5. Verify Cached Prices

After population, verify prices were cached:

```sql
SELECT * FROM asset_prices 
WHERE symbol = 'XAU' 
ORDER BY date DESC 
LIMIT 10;
```

---

## Troubleshooting

### Job Status is "failed"

Check the error message:
```bash
curl "http://localhost:8080/api/admin/price-population/jobs?id=1"
```

Common issues:
- Invalid API key
- Rate limit exceeded
- Wrong response path
- API endpoint down

### Prices Not Populating

1. Check job status
2. Verify API endpoint works manually
3. Check response_path matches actual response
4. Verify environment variables are set

### Wrong Prices

1. Check response_path extracts correct value
2. Verify currency matches
3. Check provider_id is correct

---

## Migration Guide

To enable this feature on existing installation:

```bash
# Run migration
cd backend
go run migrations/migrate.go up

# Set environment variables
export METALS_API_KEY="your-key"

# Restart backend
```

---

## API Reference

### Create Asset with Mapping

```
POST /api/admin/assets
Content-Type: application/json

{
  "asset": {...},
  "mapping": {...}
}
```

### Create Population Job

```
POST /api/admin/price-population/jobs
Content-Type: application/json

{
  "asset_id": 5,
  "mapping_id": 3,
  "start_date": "2024-01-01",
  "end_date": "2024-01-15"
}
```

### Get Job Status

```
GET /api/admin/price-population/jobs?id={job_id}
```

### List Jobs

```
GET /api/admin/price-population/jobs?asset_id={asset_id}
```

---

## Next Steps

1. Run the migration: `010_price_provider_config.sql`
2. Set up environment variables for API keys
3. Test with a single asset first
4. Monitor job progress
5. Scale to more assets

---

**Related Documentation:**
- [Asset Addition Guide](./ASSET_ADDITION_GUIDE.md)
- [Asset Types Reference](./ASSET_TYPES_REFERENCE.md)

