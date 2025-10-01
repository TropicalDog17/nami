# Cryptocurrency Price Refresh Feature

## Overview

Added the ability to **refresh cryptocurrency prices** for existing transactions. When you click the refresh button on a crypto transaction, the system will:

1. ✅ Fetch the latest price from CoinGecko for the transaction date
2. ✅ Update `price_local` with the fetched price
3. ✅ Recalculate all derived fields (`amount_usd`, `amount_vnd`, etc.)
4. ✅ Update the transaction in the database

---

## What Changed

### 1. **Added Price Service to Transaction Service**

**File**: `backend/internal/services/transaction_service.go`

- Added `priceService` field to `transactionService` struct
- Created new constructor: `NewTransactionServiceWithFXAndPrices`
- Now the transaction service can fetch crypto prices when refreshing

### 2. **Enhanced `RecalculateOneFX` Function**

**File**: `backend/internal/services/transaction_service.go`

The refresh function now:
- **Detects cryptocurrencies** using `IsCryptocurrency()`
- **Fetches the price** from CoinGecko for the transaction date
- **Updates `price_local`** with the fetched price
- **Sets FX rates to 1** for crypto (since price is in USD)
- **Recalculates all amounts** based on the new price

**For Fiat Currencies**: Still uses the FX provider (no change)
**For Cryptocurrencies**: Fetches price from CoinGecko + sets FX to 1

### 3. **Enhanced Bulk `RecalculateFX` Function**

**File**: `backend/internal/services/transaction_service.go`

The bulk refresh (refresh all button) now also:
- Refreshes crypto prices for all cryptocurrency transactions
- Updates `price_local` for crypto assets
- Recalculates all derived fields

### 4. **Updated Main Initialization**

**File**: `backend/cmd/server/main.go`

Changed from:
```go
transactionService := services.NewTransactionServiceWithFX(database, httpFXProvider)
```

To:
```go
transactionService := services.NewTransactionServiceWithFXAndPrices(database, httpFXProvider, assetPriceService)
```

Now the transaction service has access to the price service for crypto price fetching.

---

## How to Use

### Option 1: Refresh Single Transaction (UI)

1. Go to the Transactions page
2. Find an ETH (or other crypto) transaction
3. Click the **refresh button** (↻) on the row
4. The price will be fetched from CoinGecko and updated

### Option 2: Refresh Single Transaction (API)

```bash
# Get transaction ID first
curl 'http://localhost:8080/api/transactions?assets=ETH&limit=1'

# Refresh the transaction (replace {id} with actual ID)
curl -X POST 'http://localhost:8080/api/transactions/{id}/recalc?only_missing=false'
```

**Parameters**:
- `only_missing=false`: Force refresh (fetch new price even if price exists)
- `only_missing=true`: Only refresh if price is missing (default)

### Option 3: Bulk Refresh All Transactions (UI)

1. Go to the Transactions page
2. Click the **"Refresh All"** button at the top
3. All crypto transactions will have their prices refreshed

### Option 4: Bulk Refresh All Transactions (API)

```bash
curl -X POST 'http://localhost:8080/api/admin/maintenance/recalc-fx?only_missing=false'
```

---

## Example

### Before Refresh:
```json
{
  "id": "abc-123",
  "asset": "ETH",
  "quantity": "1.355",
  "price_local": "1",           // ❌ Wrong!
  "amount_usd": "1.36",         // ❌ Wrong!
  "fx_to_usd": "1"
}
```

### After Refresh:
```json
{
  "id": "abc-123",
  "asset": "ETH",
  "quantity": "1.355",
  "price_local": "3500.00",     // ✅ Fetched from CoinGecko
  "amount_usd": "4742.50",      // ✅ Correct: 1.355 × 3500
  "fx_to_usd": "1"
}
```

---

## Testing

### Automated Test Script

```bash
chmod +x test_refresh_crypto_price.sh
./test_refresh_crypto_price.sh
```

This script will:
1. Find an ETH transaction
2. Show the current price
3. Refresh the transaction
4. Show the updated price
5. Validate the refresh worked

### Manual Testing

1. **Create a test transaction** with wrong price:
   ```bash
   curl 'http://localhost:8080/api/transactions' \
     -H 'Content-Type: application/json' \
     --data-raw '{
       "date": "2025-09-25T00:00:00Z",
       "type": "deposit",
       "asset": "ETH",
       "account": "Test Account",
       "quantity": "1.0",
       "price_local": "1"
     }'
   ```

2. **Get the transaction ID** from the response

3. **Refresh the transaction**:
   ```bash
   curl -X POST 'http://localhost:8080/api/transactions/{id}/recalc?only_missing=false'
   ```

4. **Verify** the `price_local` is now the actual ETH price (not 1)

---

## Technical Details

### Price Fetching Logic

```go
// For cryptocurrencies, refresh the price from the price provider
if models.IsCryptocurrency(asset) && s.priceService != nil {
    // Fetch the latest price in USD
    ap, err := s.priceService.GetDaily(ctx, asset, "USD", date)
    if err == nil && ap != nil && !ap.Price.IsZero() {
        priceLocal = ap.Price
    }
    // For crypto, always set FX rates to 1 (price is already in USD)
    fxUSD = decimal.NewFromInt(1)
    fxVND = decimal.NewFromInt(1)
}
```

### Database Update

The refresh now updates:
- `price_local` (new!)
- `amount_local` (new!)
- `fx_to_usd`
- `fx_to_vnd`
- `amount_usd`
- `amount_vnd`
- `delta_qty`
- `cashflow_usd`
- `cashflow_vnd`
- `updated_at`

---

## Benefits

✅ **Fix old transactions** with incorrect prices  
✅ **Update prices** when market prices change  
✅ **Accurate portfolio valuation** in the "Breakdown by Asset" view  
✅ **Works for all cryptocurrencies** (BTC, ETH, SOL, etc.)  
✅ **Automatic caching** - prices are cached after fetching  
✅ **Bulk refresh** - update all transactions at once  

---

## Important Notes

1. **Date-based pricing**: The system fetches the price for the **transaction date**, not today's price
2. **Caching**: Prices are cached in the database, so subsequent refreshes are fast
3. **Rate limits**: CoinGecko free tier has rate limits (10-50 calls/minute)
4. **Fiat currencies**: Still use FX rates (no change to existing behavior)

---

## Troubleshooting

### "Price is still 1 after refresh"
- **Cause**: CoinGecko API rate limit or network issue
- **Solution**: Wait 1 minute and try again

### "Price service not available"
- **Cause**: Backend not properly initialized with price service
- **Solution**: Make sure you rebuilt the backend after the changes

### "Failed to fetch price"
- **Cause**: No price data available for that date
- **Solution**: Use a more recent date or check if the asset is supported

---

## Next Steps

After rebuilding the backend:

1. **Test with existing ETH transaction**:
   ```bash
   ./test_refresh_crypto_price.sh
   ```

2. **Check the portfolio view** - ETH value should now be correct

3. **Refresh all transactions** if you have multiple crypto transactions with wrong prices

---

## Files Modified

1. `backend/internal/services/transaction_service.go`
   - Added `priceService` field
   - Created `NewTransactionServiceWithFXAndPrices` constructor
   - Enhanced `RecalculateOneFX` to fetch crypto prices
   - Enhanced `RecalculateFX` to fetch crypto prices in bulk

2. `backend/cmd/server/main.go`
   - Updated to use `NewTransactionServiceWithFXAndPrices`

3. `test_refresh_crypto_price.sh` (new)
   - Test script for validating the refresh functionality

