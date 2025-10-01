#!/bin/bash

# Asset Addition Examples Script
# This script demonstrates how to add different types of assets to Nami

set -e

API_URL="${API_URL:-http://localhost:8080}"

echo "🚀 Nami Asset Addition Examples"
echo "================================"
echo ""

# Function to add asset
add_asset() {
    local name=$1
    local payload=$2
    
    echo "📝 Adding $name..."
    response=$(curl -s -X POST "$API_URL/api/admin/assets" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    if echo "$response" | grep -q "error"; then
        echo "❌ Failed to add $name"
        echo "$response"
    else
        echo "✅ Successfully added $name"
        asset_id=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
        echo "   Asset ID: $asset_id"
    fi
    echo ""
}

# Example 1: Bitcoin (Simple - using existing CoinGecko provider)
echo "Example 1: Bitcoin (Crypto)"
echo "----------------------------"
add_asset "Bitcoin" '{
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

# Example 2: Ethereum
echo "Example 2: Ethereum (Crypto)"
echo "----------------------------"
add_asset "Ethereum" '{
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

# Example 3: Solana
echo "Example 3: Solana (Crypto)"
echo "--------------------------"
add_asset "Solana" '{
  "asset": {
    "symbol": "SOL",
    "name": "Solana",
    "decimals": 8,
    "is_active": true
  },
  "mapping": {
    "provider": "coingecko",
    "provider_id": "solana",
    "quote_currency": "USD",
    "is_popular": true
  }
}'

# Example 4: USDT (Stablecoin)
echo "Example 4: USDT (Stablecoin)"
echo "----------------------------"
add_asset "Tether" '{
  "asset": {
    "symbol": "USDT",
    "name": "Tether",
    "decimals": 8,
    "is_active": true
  },
  "mapping": {
    "provider": "coingecko",
    "provider_id": "tether",
    "quote_currency": "USD",
    "is_popular": true
  }
}'

# Note: For commodities like Gold/Silver, you'll need to configure a custom API provider
# Example: Use a free API like https://www.goldapi.io/ or similar

echo "================================"
echo "✨ Done!"
echo ""
echo "Next steps:"
echo "1. Check assets: curl $API_URL/api/admin/assets"
echo "2. Test prices: curl '$API_URL/api/prices/daily?symbol=BTC&currency=USD&start=2024-01-01&end=2024-01-05'"
echo "3. Check jobs: curl '$API_URL/api/admin/price-population/jobs?asset_id=1'"
echo ""
echo "For more examples, see docs/FLEXIBLE_PRICE_PROVIDERS.md"

