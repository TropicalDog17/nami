# Quick Fix Guide: Cryptocurrency Init Balance

## What Was Fixed

✅ **Fixed 404 error** when creating init_balance for cryptocurrencies  
✅ **Auto-fetch crypto prices** from CoinGecko  
✅ **Correct USD/VND amounts** based on real market prices  

---

## How to Use

### 1. Rebuild the Backend

```bash
cd backend
go build ./cmd/server
./server
```

### 2. Create Init Balance for Crypto

```bash
curl 'http://localhost:8080/api/actions' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "action": "init_balance",
    "params": {
      "date": "2025-09-25",
      "account": "Binance Spot",
      "asset": "ETH",
      "quantity": "1.35517677"
    }
  }'
```

### 3. Verify the Result

The response should show:
- ✅ `price_local`: Actual ETH price (e.g., $3,500)
- ✅ `amount_usd`: Correct USD amount (e.g., $4,742)
- ✅ No 404 error

---

## What Happens Automatically

1. **System detects** ETH is a cryptocurrency
2. **Fetches price** from CoinGecko (e.g., $3,500)
3. **Caches price** in database for future use
4. **Calculates amounts** correctly:
   - `amount_usd = 1.355 ETH × $3,500 = $4,742.50`

---

## Supported Cryptocurrencies

BTC, ETH, USDT, USDC, DAI, BUSD, SOL, ADA, AVAX, DOT, MATIC, ATOM, NEAR, ALGO, BNB, UNI, LINK, AAVE, CRV, SUSHI, XRP, LTC, DOGE, SHIB, APT, ARB, OP, PAXG, XAU

---

## Files Changed

1. `backend/internal/services/transaction_service.go` - Skip FX for crypto
2. `backend/internal/services/action_service.go` - Auto-fetch crypto prices
3. `backend/internal/models/fx_rate.go` - Expanded crypto list

---

## Test It

```bash
chmod +x test_init_balance.sh
./test_init_balance.sh
```

---

## Need Help?

See `CRYPTO_PRICE_FIX_SUMMARY.md` for detailed documentation.

