# Price Fetching Guide

This guide explains how price fetching works in Nami and how to configure it for different assets.

## Overview

Nami supports two methods for fetching asset prices:

1. **Built-in CoinGecko Provider** - For cryptocurrencies (no API key required)
2. **Flexible Custom Provider** - For any asset with a REST API endpoint

## How It Works

### 1. Built-in CoinGecko Provider (Default)

The system uses CoinGecko's free API for cryptocurrency prices. This works automatically for supported cryptocurrencies.

**Supported Cryptocurrencies:**
- BTC, ETH, USDT, USDC, DAI, BUSD
- SOL, ADA, AVAX, DOT, MATIC, ATOM, NEAR, ALGO
- BNB, UNI, LINK, AAVE, CRV, SUSHI
- XRP, LTC, DOGE, SHIB, APT, ARB, OP

**How to use:**
1. Create an asset with a supported symbol
2. Create a price mapping (optional - for better control)
3. Fetch prices via API

**Example:**
```bash
# Create BTC asset (if not exists)
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","name":"Bitcoin","decimals":8,"is_active":true}'

# Create price mapping (optional)
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {"symbol":"BTC","name":"Bitcoin","decimals":8,"is_active":true},
    "mapping": {
      "provider": "coingecko",
      "provider_id": "bitcoin",
      "quote_currency": "USD",
      "is_popular": true
    }
  }'

# Fetch prices
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-28&end=2025-09-30'
```

### 2. Flexible Custom Provider

For assets not supported by CoinGecko (like commodities, stocks, etc.), you can configure a custom API endpoint.

**Example: Gold with GoldAPI.io**
```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "XAU",
      "name": "Gold",
      "decimals": 4,
      "is_active": true
    },
    "mapping": {
      "provider": "goldapi",
      "provider_id": "XAU",
      "quote_currency": "USD",
      "is_popular": true,
      "api_endpoint": "https://www.goldapi.io/api/{symbol}/{currency}/{date_yyyymmdd}",
      "api_config": {
        "headers": {
          "x-access-token": "${GOLDAPI_TOKEN}"
        }
      },
      "response_path": "price",
      "auto_populate": false
    }
  }'
```

## Testing Price Fetching

### 1. Check if asset exists
```bash
curl 'http://localhost:8080/api/admin/assets' | jq '.[] | select(.symbol == "BTC")'
```

### 2. Check if price mapping exists
```bash
# This is done internally by the system
# If no mapping exists, the built-in CoinGecko provider is used for supported symbols
```

### 3. Fetch prices
```bash
# Single day
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'

# Date range
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-28&end=2025-09-30'

# With VND conversion
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=VND&start=2025-09-30&end=2025-09-30'
```

### 4. Check cached prices
```bash
# Prices are automatically cached in the database
# You can verify by fetching the same date range again - it should be faster
```

## Troubleshooting

### Issue: "unsupported symbol: XYZ"

**Cause:** The symbol is not in the built-in CoinGecko mapping.

**Solution:** 
1. Check if the symbol is supported by CoinGecko
2. If yes, add it to `backend/internal/services/crypto_price_provider.go` in the `mapSymbolToCoinGeckoID` function
3. If no, configure a custom API provider

### Issue: "coingecko status 429"

**Cause:** Rate limit exceeded (CoinGecko free tier: 10-50 calls/minute).

**Solution:**
1. Reduce the date range in your requests
2. Use cached prices (they're stored in the database)
3. Consider upgrading to CoinGecko Pro API

### Issue: Prices not fetching for custom asset

**Cause:** Missing or incorrect price mapping configuration.

**Solution:**
1. Verify the API endpoint is correct
2. Test the API endpoint manually with curl
3. Check the response_path matches the actual API response structure
4. Verify environment variables are set (if using ${VAR_NAME})

## Configuration Examples

### CoinGecko (Crypto)

```json
{
  "provider": "coingecko",
  "provider_id": "bitcoin",
  "quote_currency": "USD",
  "is_popular": true
}
```

**No additional configuration needed** - the built-in provider handles the API calls.

### Custom API with API Key

```json
{
  "provider": "custom-provider",
  "provider_id": "SYMBOL",
  "quote_currency": "USD",
  "api_endpoint": "https://api.example.com/v1/price",
  "api_config": {
    "headers": {
      "X-API-Key": "${CUSTOM_API_KEY}"
    },
    "query_params": {
      "symbol": "{symbol}",
      "date": "{date}",
      "currency": "{currency}"
    }
  },
  "response_path": "data.price"
}
```

### Custom API with Bearer Token

```json
{
  "provider": "custom-provider",
  "provider_id": "SYMBOL",
  "quote_currency": "USD",
  "api_endpoint": "https://api.example.com/v1/price",
  "api_config": {
    "auth_type": "bearer",
    "auth_value": "${API_TOKEN}",
    "query_params": {
      "symbol": "{symbol}",
      "date": "{date}"
    }
  },
  "response_path": "price"
}
```

## Environment Variables

Set environment variables for API keys:

```bash
# In your .env file or shell
export GOLDAPI_TOKEN="your-token-here"
export CUSTOM_API_KEY="your-key-here"
export ALPHAVANTAGE_API_KEY="your-key-here"
```

Then restart the backend server:
```bash
cd backend
./server
```

## API Endpoints

### Get Daily Prices

```
GET /api/prices/daily?symbol={SYMBOL}&currency={CURRENCY}&start={START_DATE}&end={END_DATE}
```

**Parameters:**
- `symbol` (required): Asset symbol (e.g., BTC, ETH, XAU)
- `currency` (optional): Target currency (default: USD)
- `start` (optional): Start date in YYYY-MM-DD format
- `end` (optional): End date in YYYY-MM-DD format

**Response:**
```json
[
  {
    "id": 1,
    "symbol": "BTC",
    "currency": "USD",
    "price": "114309.15041119",
    "date": "2025-09-30T00:00:00Z",
    "source": "coingecko",
    "created_at": "2025-09-30T15:34:42.478573Z"
  }
]
```

## Next Steps

1. **Add more cryptocurrencies**: Just create the asset, no mapping needed
2. **Add custom assets**: Create asset + mapping with API configuration
3. **Monitor rate limits**: CoinGecko free tier has limits
4. **Cache optimization**: Prices are automatically cached in the database

## Related Documentation

- [Flexible Price Providers](./FLEXIBLE_PRICE_PROVIDERS.md)
- [Asset Addition Guide](./ASSET_ADDITION_GUIDE.md)
- [API Documentation](./README.md)

