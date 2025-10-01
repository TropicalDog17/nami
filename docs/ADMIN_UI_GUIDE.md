# Admin UI Guide - Asset Management

This guide explains how to use the Admin UI to add and manage assets with flexible price providers.

## Overview

The Admin UI provides a user-friendly interface for:
- ✅ Adding new assets (crypto, commodities, fiat)
- ✅ Configuring custom price providers
- ✅ Viewing current prices for all assets
- ✅ Setting up automatic historical price population
- ✅ Managing asset status (active/inactive)

## Accessing the Admin Panel

1. Navigate to the Admin page in your Nami application
2. Click on the **"Assets"** tab
3. You'll see a list of all assets with their current prices

## Asset List Features

### Current Price Display

Each asset in the list shows:
- **Symbol** - Asset ticker (e.g., BTC, XAU, USD)
- **Name** - Full asset name
- **Decimals** - Precision level
- **Current Price (USD)** - Today's price (auto-fetched)
- **Status** - Active or Inactive
- **Actions** - Activate/Deactivate, Delete

### Price Loading

- Prices are fetched automatically when you open the Assets tab
- "Loading..." appears while fetching
- "No price data" shows if no price is available
- Prices are displayed in USD with appropriate decimal places

## Adding a New Asset

### Step 1: Click "Add Asset"

Click the **"+ Add Asset"** button in the top-right corner.

### Step 2: Fill Asset Information

**Required Fields:**
- **Symbol*** - Asset ticker (e.g., BTC, ETH, XAU)
- **Name*** - Full name (e.g., Bitcoin, Gold)

**Optional Fields:**
- **Decimals** - Precision (default: 8)
  - Crypto: 8 decimals
  - Commodities: 4 decimals
  - Fiat: 2 decimals
- **Active** - Checkbox to set initial status

### Step 3: Configure Price Provider (Optional)

Enable the **"Enable Price Fetching"** checkbox to configure automatic price fetching.

#### Quick Setup with Templates

Choose from pre-configured templates:

**1. CoinGecko (Crypto)**
- Best for: Bitcoin, Ethereum, and other cryptocurrencies
- No API key required
- Example Provider ID: `bitcoin`, `ethereum`, `solana`

**2. Metals API (Gold, Silver)**
- Best for: Precious metals
- Requires API key (set `METALS_API_KEY` environment variable)
- Example Provider ID: `XAU` (gold), `XAG` (silver)

**3. Custom API**
- For any other price source
- Requires manual configuration

#### Basic Configuration

After selecting a template:

1. **Provider ID*** - Asset identifier in the provider's system
   - CoinGecko: Use lowercase name (e.g., `bitcoin`, `ethereum`)
   - Metals API: Use symbol (e.g., `XAU`, `XAG`)

2. **Quote Currency** - Base currency for prices (usually USD)

#### Auto-Populate Historical Prices

Enable **"Auto-populate historical prices"** to automatically fetch past prices:

1. Check the auto-populate checkbox
2. Set **"Populate from date"** (optional)
   - Leave empty to populate from 1 year ago
   - Or select a specific start date

**What happens:**
- A background job is created
- Prices are fetched day-by-day from the start date to today
- Progress can be tracked via API
- Prices are cached in the database

### Step 4: Advanced Configuration (Optional)

Click **"▶ Advanced Configuration"** to customize:

#### API Endpoint
Custom URL template with placeholders:
```
https://api.example.com/prices/{date}
```

**Available Placeholders:**
- `{symbol}` - Asset symbol
- `{provider_id}` - Provider-specific ID
- `{currency}` - Quote currency
- `{date}` - Date in YYYY-MM-DD format
- `{date_yyyymmdd}` - Date in YYYYMMDD format
- `{date_ddmmyyyy}` - Date in DD-MM-YYYY format

#### Response Path
JSON path to extract price from API response:
```
data.price
rates.XAU
market_data.current_price.usd
```

#### API Configuration (JSON)
Configure headers, query parameters, and authentication:

```json
{
  "headers": {
    "Accept": "application/json"
  },
  "query_params": {
    "api_key": "${API_KEY}",
    "symbol": "{symbol}"
  },
  "auth_type": "bearer",
  "auth_value": "${TOKEN}"
}
```

**Authentication Types:**
- `none` - No authentication
- `bearer` - Bearer token (adds `Authorization: Bearer <token>`)
- `apikey` - API key (adds `X-API-Key: <key>`)

**Environment Variables:**
Use `${VAR_NAME}` syntax to reference environment variables:
- `${METALS_API_KEY}` - Metals API key
- `${API_TOKEN}` - Custom API token
- `${CUSTOM_KEY}` - Any environment variable

### Step 5: Submit

Click **"Create Asset"** to save.

**What happens:**
1. Asset is created in the database
2. Price mapping is created (if enabled)
3. Background job starts (if auto-populate is enabled)
4. You're redirected to the asset list
5. Current price is fetched automatically

## Example Workflows

### Example 1: Add Bitcoin (Simple)

1. Click "Add Asset"
2. Fill in:
   - Symbol: `BTC`
   - Name: `Bitcoin`
   - Decimals: `8`
3. Enable "Enable Price Fetching"
4. Select "CoinGecko (Crypto)" template
5. Provider ID: `bitcoin`
6. Click "Create Asset"

✅ Done! Bitcoin is added and current price will appear.

### Example 2: Add Gold with Historical Prices

1. Click "Add Asset"
2. Fill in:
   - Symbol: `XAU`
   - Name: `Gold`
   - Decimals: `4`
3. Enable "Enable Price Fetching"
4. Select "Metals API (Gold, Silver)" template
5. Provider ID: `XAU`
6. Enable "Auto-populate historical prices"
7. Set "Populate from date": `2023-01-01`
8. Click "Create Asset"

✅ Done! Gold is added and historical prices are being fetched in the background.

### Example 3: Add Custom Asset

1. Click "Add Asset"
2. Fill in asset information
3. Enable "Enable Price Fetching"
4. Select "Custom API" template
5. Click "▶ Advanced Configuration"
6. Configure:
   - API Endpoint: `https://api.example.com/prices?symbol={symbol}&date={date}`
   - Response Path: `data.price`
   - API Configuration:
     ```json
     {
       "headers": {"Accept": "application/json"},
       "auth_type": "bearer",
       "auth_value": "${MY_API_TOKEN}"
     }
     ```
7. Click "Create Asset"

✅ Done! Custom asset is added with your API configuration.

## Managing Existing Assets

### View Current Prices

Current prices are displayed automatically in the asset list:
- Green text with dollar sign for available prices
- "Loading..." while fetching
- "No price data" if unavailable

### Activate/Deactivate Asset

Click **"Activate"** or **"Deactivate"** to toggle asset status:
- Active assets appear with green "Active" badge
- Inactive assets appear with gray "Inactive" badge
- Inactive assets can be hidden with "Show Inactive" checkbox

### Delete Asset

Click **"Delete"** to remove an asset:
- Confirmation dialog appears
- Asset and all related data are deleted
- Cannot be undone

## Tips & Best Practices

### 💡 Choosing Decimals

- **Crypto**: Use 8 decimals (Bitcoin standard)
- **Commodities**: Use 4 decimals (precious metals)
- **Fiat**: Use 2 decimals (standard currency)
- **Stablecoins**: Use 8 decimals (like crypto)

### 💡 Provider IDs

**CoinGecko:**
- Use lowercase, hyphenated names
- Check https://www.coingecko.com/ for correct IDs
- Examples: `bitcoin`, `ethereum`, `usd-coin`

**Metals API:**
- Use standard metal symbols
- Examples: `XAU` (gold), `XAG` (silver), `XPT` (platinum)

### 💡 Auto-Populate

- Start with small date ranges for testing
- Monitor API rate limits
- Check background job status via API
- Prices are cached to reduce API calls

### 💡 Environment Variables

- Set API keys as environment variables
- Never hardcode keys in the UI
- Restart backend after adding new variables
- Use `${VAR_NAME}` syntax in configuration

### 💡 Testing Configuration

Before enabling auto-populate:
1. Test API endpoint manually with curl
2. Verify response structure
3. Confirm response path extracts correct value
4. Check authentication works

## Troubleshooting

### "No price data" appears

**Possible causes:**
- No price mapping configured
- API endpoint is incorrect
- Authentication failed
- Asset not found in provider's system

**Solutions:**
- Check provider ID is correct
- Verify API key is set
- Test API endpoint manually
- Check backend logs for errors

### Prices not loading

**Possible causes:**
- Backend is down
- API rate limit exceeded
- Network issues

**Solutions:**
- Refresh the page
- Check backend is running
- Wait a few minutes and try again
- Check browser console for errors

### Auto-populate not working

**Possible causes:**
- Background job failed
- API configuration incorrect
- Rate limit exceeded

**Solutions:**
- Check job status via API: `GET /api/admin/price-population/jobs?asset_id={id}`
- Review error messages in job status
- Verify API configuration
- Check backend logs

## API Endpoints for Advanced Users

### Check Job Status
```bash
curl "http://localhost:8080/api/admin/price-population/jobs?asset_id=5"
```

### Get Current Price
```bash
curl "http://localhost:8080/api/prices/daily?symbol=BTC&currency=USD&start=2024-01-15&end=2024-01-15"
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

## Related Documentation

- [Flexible Price Providers](./FLEXIBLE_PRICE_PROVIDERS.md) - Complete API guide
- [Asset Addition Guide](./ASSET_ADDITION_GUIDE.md) - Step-by-step instructions
- [Asset Types Reference](./ASSET_TYPES_REFERENCE.md) - Asset specifications
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Technical overview

---

**Need Help?**
- Check the documentation in `docs/`
- Review example configurations
- Test with simple assets first (e.g., Bitcoin)
- Check backend logs for detailed errors

