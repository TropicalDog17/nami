# Quick Start: Price Fetching

## TL;DR

**For Cryptocurrencies (BTC, ETH, etc.):**
- ✅ Works out of the box with CoinGecko (no API key needed)
- ✅ Just create the asset and fetch prices

**For Custom Assets (Gold, Stocks, etc.):**
- ⚠️ Requires custom API configuration
- ⚠️ Needs API key from a price provider

## 1. Create a Cryptocurrency Asset

```bash
# Simple method
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","name":"Bitcoin","decimals":8,"is_active":true}'

# With mapping (recommended)
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
```

## 2. Fetch Prices

```bash
# Get BTC price for today
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'

# Get BTC price for a date range
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-28&end=2025-09-30'

# Get BTC price in VND
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=VND&start=2025-09-30&end=2025-09-30'
```

## 3. Supported Cryptocurrencies

**Major:**
- BTC (Bitcoin)
- ETH (Ethereum)

**Stablecoins:**
- USDT, USDC, DAI, BUSD

**Commodity-backed:**
- PAXG (Pax Gold), XAU (Gold)

**Layer 1:**
- SOL, ADA, AVAX, DOT, MATIC, ATOM, NEAR, ALGO

**DeFi:**
- BNB, UNI, LINK, AAVE, CRV, SUSHI

**Others:**
- XRP, LTC, DOGE, SHIB, APT, ARB, OP

## 4. Add More Cryptocurrencies

### Find CoinGecko ID

1. Go to https://www.coingecko.com/
2. Search for your cryptocurrency
3. Copy the ID from the URL

Example: For Cardano, URL is `https://www.coingecko.com/en/coins/cardano`, so ID is `cardano`.

### Add to Code

Edit `backend/internal/services/crypto_price_provider.go`:

```go
case "ADA":
    return "cardano"
case "YOUR_SYMBOL":
    return "your-coingecko-id"
```

### Rebuild

```bash
cd backend
go build ./cmd/server
./server
```

## 5. For Custom Assets (Gold, Stocks, etc.)

You need:
1. A price API provider (e.g., GoldAPI.io, Alpha Vantage)
2. An API key
3. Custom configuration

**Example:**
```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {"symbol":"XAU","name":"Gold","decimals":4,"is_active":true},
    "mapping": {
      "provider": "goldapi",
      "provider_id": "XAU",
      "quote_currency": "USD",
      "api_endpoint": "https://www.goldapi.io/api/{symbol}/{currency}",
      "api_config": {
        "headers": {"x-access-token": "${GOLDAPI_TOKEN}"}
      },
      "response_path": "price"
    }
  }'
```

Set environment variable:
```bash
export GOLDAPI_TOKEN="your-token-here"
```

## 6. Troubleshooting

### "unsupported symbol: XYZ"
→ Add the symbol to `crypto_price_provider.go` (see step 4)

### "coingecko status 429"
→ Rate limit exceeded. Wait 1 minute or use cached prices.

### "coingecko status 404"
→ Wrong CoinGecko ID. Check at https://www.coingecko.com/

### Prices not fetching for custom asset
→ Check API endpoint, response_path, and environment variables

## 7. Testing

```bash
# Test BTC
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30' | jq '.'

# Test ETH
curl 'http://localhost:8080/api/prices/daily?symbol=ETH&currency=USD&start=2025-09-30&end=2025-09-30' | jq '.'

# Test caching (should be faster on second call)
time curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'
time curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'
```

## 8. Rate Limits

**CoinGecko Free Tier:**
- 10-50 calls per minute
- No API key required
- Historical data available

**Best Practices:**
- Use date ranges wisely
- Leverage caching (automatic)
- Don't fetch too many days at once

## 9. Documentation

**Quick Guides:**
- `QUICK_START_PRICES.md` - This file
- `docs/COINGECKO_SETUP.md` - CoinGecko setup

**Detailed Guides:**
- `docs/PRICE_FETCHING_GUIDE.md` - General price fetching
- `docs/FLEXIBLE_PRICE_PROVIDERS.md` - Custom API configuration

## 10. Examples

### Create Multiple Assets

```bash
# BTC
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","name":"Bitcoin","decimals":8,"is_active":true}'

# ETH
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETH","name":"Ethereum","decimals":18,"is_active":true}'

# BNB
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BNB","name":"Binance Coin","decimals":8,"is_active":true}'
```

### Fetch Prices for Multiple Assets

```bash
# BTC
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'

# ETH
curl 'http://localhost:8080/api/prices/daily?symbol=ETH&currency=USD&start=2025-09-30&end=2025-09-30'

# BNB
curl 'http://localhost:8080/api/prices/daily?symbol=BNB&currency=USD&start=2025-09-30&end=2025-09-30'
```

## Summary

✅ **Cryptocurrencies:** Work out of the box with CoinGecko (no API key)
✅ **Caching:** Automatic (prices stored in database)
✅ **Rate Limits:** 10-50 calls/minute (free tier)
⚠️ **Custom Assets:** Require API configuration and API key

**Next Steps:**
1. Create cryptocurrency assets
2. Fetch prices
3. For custom assets, see `docs/PRICE_FETCHING_GUIDE.md`

