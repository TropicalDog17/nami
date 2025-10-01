# Nami Asset Management Documentation

This directory contains comprehensive documentation for adding and managing assets in the Nami financial tracking system.

## Quick Start

**New to asset management?** Start here:
1. **For UI Users**: Read the [Admin UI Guide](./ADMIN_UI_GUIDE.md) for using the web interface ⭐
2. **For API Users**: Read the [Flexible Price Providers Guide](./FLEXIBLE_PRICE_PROVIDERS.md)
3. **For Developers**: Check the [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

## Documentation Index

### User Guides

- **[Admin UI Guide](./ADMIN_UI_GUIDE.md)** ⭐ **RECOMMENDED** - Web interface guide
  - Adding assets via UI
  - Configuring price providers with templates
  - Viewing current prices automatically
  - Managing asset status
  - Step-by-step workflows with screenshots

- **[Flexible Price Providers](./FLEXIBLE_PRICE_PROVIDERS.md)** - API-based configuration
  - Custom API endpoints
  - Automatic price population
  - Background job tracking
  - Environment variables
  - Advanced configurations

### Technical Reference

- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Technical overview
  - Architecture and design
  - Database schema changes
  - API endpoints
  - Code examples
  - Deployment instructions

## Features

### ✨ What's New

**Admin UI for Asset Management:**
- 🎨 User-friendly web interface
- 📊 Real-time price display
- 🔧 Provider templates (CoinGecko, Metals API, Custom)
- ⚡ Auto-populate historical prices
- 🎯 No code changes required

**Flexible Price Providers:**
- 🔌 Configure any REST API
- 🔐 Secure authentication (Bearer, API Key)
- 📍 JSON path extraction
- 🌍 Environment variable support
- 🔄 Background job processing

**Extended Asset Support:**
- 💰 20+ cryptocurrencies
- 🥇 Precious metals (Gold, Silver, Platinum, Palladium)
- 💵 Fiat currencies
- 🎯 Custom assets

## Quick Examples

### Example 1: Add Bitcoin via UI

1. Open Admin Panel → Assets tab
2. Click "Add Asset"
3. Fill in:
   - Symbol: `BTC`
   - Name: `Bitcoin`
   - Decimals: `8`
4. Enable "Enable Price Fetching"
5. Select "CoinGecko (Crypto)" template
6. Provider ID: `bitcoin`
7. Click "Create Asset"

✅ Done! Bitcoin appears with current price.

### Example 2: Add Gold with Historical Prices

1. Open Admin Panel → Assets tab
2. Click "Add Asset"
3. Fill in:
   - Symbol: `XAU`
   - Name: `Gold`
   - Decimals: `4`
4. Enable "Enable Price Fetching"
5. Select "Metals API" template
6. Provider ID: `XAU`
7. Enable "Auto-populate historical prices"
8. Set date: `2023-01-01`
9. Click "Create Asset"

✅ Done! Gold is added and historical prices are being fetched.

### Example 3: Add Asset via API

```bash
curl -X POST http://localhost:8080/api/admin/assets \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "symbol": "ETH",
      "name": "Ethereum",
      "decimals": 8,
      "is_active": true
    },
    "mapping": {
      "provider": "coingecko",
      "provider_id": "ethereum",
      "quote_currency": "USD",
      "is_popular": true
    }
  }'
```

## Supported Assets

### Cryptocurrencies (via CoinGecko)
- **Major**: BTC, ETH
- **Stablecoins**: USDT, USDC, DAI, BUSD
- **Layer 1**: SOL, ADA, AVAX, DOT, MATIC, ATOM, NEAR, ALGO
- **DeFi**: BNB, UNI, LINK, AAVE, CRV, SUSHI
- **Others**: XRP, LTC, DOGE, SHIB, APT, ARB, OP

### Custom Assets
- Any asset with a REST API endpoint

## Getting Started

### Prerequisites

1. **Backend running**: `cd backend && ./server`
2. **Database migrated**: Run migration `010_price_provider_config.sql`
3. **Environment variables** (optional for custom APIs):
   ```bash
   export CUSTOM_API_KEY="your-key"
   ```

### Using the UI

1. Navigate to Admin Panel
2. Click "Assets" tab
3. Click "Add Asset"
4. Follow the form wizard
5. Submit and view your asset with current price

### Using the API

1. Read [Flexible Price Providers Guide](./FLEXIBLE_PRICE_PROVIDERS.md)
2. Prepare your API request
3. Send POST to `/api/admin/assets`
4. Check job status if auto-populate is enabled

## Architecture

```
┌─────────────┐
│  Admin UI   │ ← User-friendly interface
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Admin API  │ ← REST endpoints
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Admin Service                  │
│  - CreateAsset()                │
│  - CreateAssetPriceMapping()    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Price Population Service       │
│  - AutoPopulateOnCreate()       │
│  - PopulatePrices()             │
│  - CreatePopulationJob()        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Generic Price Provider         │
│  - FetchPrice()                 │
│  - Build URL with placeholders  │
│  - Extract price via JSON path  │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────┐
│ External API│ (CoinGecko, Metals API, etc.)
└─────────────┘
```

## Troubleshooting

### UI Issues

**"No price data" appears:**
- Check provider ID is correct
- Verify API key is set (for Metals API)
- Test API endpoint manually

**Prices not loading:**
- Refresh the page
- Check backend is running
- Check browser console for errors

### API Issues

**"Failed to create asset":**
- Check request payload is valid JSON
- Verify asset symbol doesn't already exist
- Check backend logs

**Auto-populate not working:**
- Check job status: `GET /api/admin/price-population/jobs?asset_id={id}`
- Review error messages
- Verify API configuration

## Best Practices

### 💡 For UI Users

1. **Start simple** - Add Bitcoin first to test
2. **Use templates** - They're pre-configured and tested
3. **Test before auto-populate** - Verify provider ID works
4. **Monitor prices** - Check if current price appears
5. **Check job status** - Use API to track background jobs

### 💡 For API Users

1. **Use environment variables** - Never hardcode API keys
2. **Start with small date ranges** - Test with 1 week first
3. **Monitor rate limits** - Check your API provider's limits
4. **Verify cached prices** - Query `asset_prices` table
5. **Handle errors gracefully** - Check job status for failures

### 💡 For Developers

1. **Read the code** - Check `backend/internal/services/`
2. **Review migrations** - Understand schema changes
3. **Test thoroughly** - Use example scripts
4. **Check logs** - Backend logs show detailed errors
5. **Extend carefully** - Follow existing patterns

## Support

### Documentation
- [Admin UI Guide](./ADMIN_UI_GUIDE.md) - UI walkthrough
- [Flexible Price Providers](./FLEXIBLE_PRICE_PROVIDERS.md) - API reference
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Technical details

### Examples
- `scripts/add_asset_examples.sh` - Automated examples
- API examples in each guide
- Provider templates in UI

### Troubleshooting
- Check backend logs
- Review job status via API
- Test API endpoints manually
- Verify environment variables

## Contributing

When adding new features:
1. Update relevant documentation
2. Add examples
3. Test with UI and API
4. Update this README

---

**Last Updated**: 2025-09-30  
**Version**: 1.0.0  
**Status**: Production Ready ✅

