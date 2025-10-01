# CoinGecko Price Fetching Setup

## Overview

Nami uses CoinGecko's **free API** (no API key required) to fetch cryptocurrency prices. This guide explains how it works and how to use it.

## How It Works

### 1. Built-in Support

The system has a built-in CoinGecko provider that automatically fetches prices for supported cryptocurrencies.

**Location:** `backend/internal/services/crypto_price_provider.go`

### 2. Supported Cryptocurrencies

The following symbols are automatically supported:

**Major Cryptocurrencies:**
- BTC (Bitcoin)
- ETH (Ethereum)

**Stablecoins:**
- USDT (Tether)
- USDC (USD Coin)
- DAI (Dai)
- BUSD (Binance USD)

**Commodity-backed Tokens:**
- PAXG (Pax Gold)
- XAU (Gold - mapped to PAXG)

**Layer 1 Blockchains:**
- SOL (Solana)
- ADA (Cardano)
- AVAX (Avalanche)
- DOT (Polkadot)
- MATIC (Polygon)
- ATOM (Cosmos)
- NEAR (Near)
- ALGO (Algorand)

**DeFi & Exchange Tokens:**
- BNB (Binance Coin)
- UNI (Uniswap)
- LINK (Chainlink)
- AAVE (Aave)
- CRV (Curve)
- SUSHI (Sushi)

**Other Popular Tokens:**
- XRP (Ripple)
- LTC (Litecoin)
- DOGE (Dogecoin)
- SHIB (Shiba Inu)
- APT (Aptos)
- ARB (Arbitrum)
- OP (Optimism)

## Quick Start

### 1. Create a Cryptocurrency Asset

**Simple method (no mapping):**
```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","name":"Bitcoin","decimals":8,"is_active":true}'
```

**With price mapping (recommended):**
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
      "is_popular": true
    }
  }'
```

### 2. Fetch Prices

```bash
# Get BTC price for a date range
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-28&end=2025-09-30'

# Get ETH price in VND
curl 'http://localhost:8080/api/prices/daily?symbol=ETH&currency=VND&start=2025-09-30&end=2025-09-30'
```

### 3. Verify Cached Prices

Prices are automatically cached in the database. Check the cache:

```bash
# Fetch the same date range again - should be instant (from cache)
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'
```

## Adding New Cryptocurrencies

If you want to add a cryptocurrency that's not in the supported list:

### 1. Find the CoinGecko ID

Visit https://www.coingecko.com/ and search for your cryptocurrency. The ID is in the URL.

Example: For Cardano, the URL is `https://www.coingecko.com/en/coins/cardano`, so the ID is `cardano`.

### 2. Add to the Mapping Function

Edit `backend/internal/services/crypto_price_provider.go`:

```go
func mapSymbolToCoinGeckoID(symbol string) string {
    switch strings.ToUpper(symbol) {
    // ... existing mappings ...
    case "ADA":
        return "cardano"
    case "YOUR_SYMBOL":
        return "coingecko-id"  // Add your mapping here
    default:
        return ""
    }
}
```

### 3. Rebuild and Restart

```bash
cd backend
go build ./cmd/server
./server
```

## CoinGecko API Limits

### Free Tier Limits

- **Rate Limit:** 10-50 calls per minute
- **No API Key Required**
- **Historical Data:** Available for all coins

### Best Practices

1. **Use date ranges wisely** - Don't fetch too many days at once
2. **Leverage caching** - Prices are cached in the database
3. **Batch requests** - Fetch multiple days in one request when possible

### If You Hit Rate Limits

**Error:** `coingecko status 429`

**Solutions:**
1. Wait a minute before retrying
2. Reduce the date range
3. Use cached prices (they're in the database)
4. Consider CoinGecko Pro API (requires API key)

## Testing

### 1. Test BTC Price Fetching

```bash
# Should return BTC prices
curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30' | jq '.'
```

**Expected response:**
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

### 2. Test Caching

```bash
# First call - fetches from CoinGecko
time curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'

# Second call - should be faster (from cache)
time curl 'http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2025-09-30&end=2025-09-30'
```

### 3. Test Multiple Cryptocurrencies

```bash
# ETH
curl 'http://localhost:8080/api/prices/daily?symbol=ETH&currency=USD&start=2025-09-30&end=2025-09-30'

# SOL
curl 'http://localhost:8080/api/prices/daily?symbol=SOL&currency=USD&start=2025-09-30&end=2025-09-30'

# BNB
curl 'http://localhost:8080/api/prices/daily?symbol=BNB&currency=USD&start=2025-09-30&end=2025-09-30'
```

## Troubleshooting

### Issue: "unsupported symbol: XYZ"

**Cause:** The symbol is not in the built-in mapping.

**Solution:** Add it to `mapSymbolToCoinGeckoID` function (see "Adding New Cryptocurrencies" above).

### Issue: "coingecko status 404"

**Cause:** The CoinGecko ID is incorrect.

**Solution:** 
1. Verify the CoinGecko ID at https://www.coingecko.com/
2. Update the mapping in `crypto_price_provider.go`

### Issue: "coingecko status 429"

**Cause:** Rate limit exceeded.

**Solution:**
1. Wait 1 minute
2. Use smaller date ranges
3. Leverage cached prices

### Issue: Prices are stale

**Cause:** Prices are cached in the database.

**Solution:** This is by design. Cached prices are used to avoid hitting rate limits. Historical prices don't change, so caching is safe.

## Configuration

### No Configuration Required!

CoinGecko's free API doesn't require an API key. The system works out of the box for all supported cryptocurrencies.

### Optional: Price Mappings

You can create price mappings for better control:

```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {"symbol":"ETH","name":"Ethereum","decimals":18,"is_active":true},
    "mapping": {
      "provider": "coingecko",
      "provider_id": "ethereum",
      "quote_currency": "USD",
      "is_popular": true
    }
  }'
```

**Benefits:**
- Explicit provider configuration
- Can set `is_popular` flag
- Can specify `quote_currency`
- Better for documentation

## Next Steps

1. **Create cryptocurrency assets** - Use the examples above
2. **Test price fetching** - Verify it works for your assets
3. **Monitor rate limits** - Stay within CoinGecko's free tier
4. **Add custom assets** - For non-crypto assets, see [PRICE_FETCHING_GUIDE.md](./PRICE_FETCHING_GUIDE.md)

## Related Documentation

- [Price Fetching Guide](./PRICE_FETCHING_GUIDE.md) - General price fetching guide
- [Flexible Price Providers](./FLEXIBLE_PRICE_PROVIDERS.md) - Custom API configuration
- [Asset Addition Guide](./ASSET_ADDITION_GUIDE.md) - How to add new assets

