# Nami Scripts

Utility scripts for managing Nami assets and operations.

## Available Scripts

### add_asset_examples.sh

Demonstrates how to add different types of assets (crypto, commodities) to Nami.

**Usage:**
```bash
# Basic usage (adds crypto assets)
./scripts/add_asset_examples.sh

# With Metals API key (adds crypto + commodities)
METALS_API_KEY="your-key" ./scripts/add_asset_examples.sh

# Custom API URL
API_URL="http://production-server:8080" ./scripts/add_asset_examples.sh
```

**What it does:**
- Adds Bitcoin, Ethereum, Solana, USDT
- Adds Gold and Silver (if METALS_API_KEY is set)
- Shows success/failure for each asset
- Provides next steps

**Environment Variables:**
- `API_URL` - Nami API URL (default: http://localhost:8080)
- `METALS_API_KEY` - Metals API key for commodity prices

## Examples

### Add Crypto Assets Only
```bash
./scripts/add_asset_examples.sh
```

### Add Crypto + Commodities
```bash
export METALS_API_KEY="your-metals-api-key"
./scripts/add_asset_examples.sh
```

### Add to Production
```bash
export API_URL="https://nami.example.com"
export METALS_API_KEY="your-key"
./scripts/add_asset_examples.sh
```

## Manual Asset Addition

### Add Single Crypto Asset
```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "ADA",
      "name": "Cardano",
      "decimals": 8,
      "is_active": true
    },
    "mapping": {
      "provider": "coingecko",
      "provider_id": "cardano",
      "quote_currency": "USD",
      "is_popular": true
    }
  }'
```

### Add Commodity with Auto-Populate
```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "XPT",
      "name": "Platinum",
      "decimals": 4,
      "is_active": true
    },
    "mapping": {
      "provider": "metals-api",
      "provider_id": "XPT",
      "quote_currency": "USD",
      "api_endpoint": "https://metals-api.com/api/{date}",
      "api_config": {
        "query_params": {
          "access_key": "'"$METALS_API_KEY"'",
          "base": "USD",
          "symbols": "XPT"
        }
      },
      "response_path": "rates.XPT",
      "auto_populate": true,
      "populate_from_date": "2024-01-01"
    }
  }'
```

## Verification

### Check Assets
```bash
curl http://localhost:8080/api/admin/assets | jq
```

### Test Price Fetching
```bash
curl "http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2024-01-01&end=2024-01-05" | jq
```

### Check Population Jobs
```bash
curl "http://localhost:8080/api/admin/price-population/jobs?asset_id=1" | jq
```

## Troubleshooting

### "Connection refused"
- Make sure backend is running: `cd backend && ./nami-server`
- Check API_URL is correct

### "Failed to add asset"
- Check request payload is valid JSON
- Verify asset symbol doesn't already exist
- Check backend logs for errors

### "Metals API" examples skipped
- Set METALS_API_KEY environment variable
- Get free key at https://metals-api.com/

## Related Documentation

- [Flexible Price Providers](../docs/FLEXIBLE_PRICE_PROVIDERS.md)
- [Asset Addition Guide](../docs/ASSET_ADDITION_GUIDE.md)
- [Implementation Summary](../docs/IMPLEMENTATION_SUMMARY.md)

