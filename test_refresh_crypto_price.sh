#!/bin/bash

# Test refreshing cryptocurrency prices

echo "Testing Crypto Price Refresh Functionality"
echo "==========================================="
echo ""

# Step 1: Get all ETH transactions
echo "Step 1: Fetching all ETH transactions..."
echo ""

response=$(curl -s 'http://localhost:8080/api/transactions?assets=ETH&limit=100')
eth_transactions=$(echo "$response" | jq -r '.[] | select(.asset == "ETH")')

if [ -z "$eth_transactions" ]; then
    echo "❌ No ETH transactions found!"
    echo "Please create an ETH transaction first using init_balance."
    exit 1
fi

# Get the first ETH transaction ID
tx_id=$(echo "$eth_transactions" | jq -r '.id' | head -n 1)
echo "Found ETH transaction: $tx_id"
echo ""

# Step 2: Show current transaction details
echo "Step 2: Current transaction details (BEFORE refresh):"
echo ""

current=$(curl -s "http://localhost:8080/api/transactions/$tx_id")
echo "$current" | jq '{
    id: .id,
    asset: .asset,
    quantity: .quantity,
    price_local: .price_local,
    amount_usd: .amount_usd,
    fx_to_usd: .fx_to_usd,
    date: .date
}'

price_before=$(echo "$current" | jq -r '.price_local')
amount_before=$(echo "$current" | jq -r '.amount_usd')

echo ""
echo "Current Price: $price_before"
echo "Current Amount USD: $amount_before"
echo ""

# Step 3: Refresh the transaction (recalculate with price fetch)
echo "Step 3: Refreshing transaction (fetching latest price from CoinGecko)..."
echo ""

refreshed=$(curl -s -X POST "http://localhost:8080/api/transactions/$tx_id/recalc?only_missing=false")

echo "Step 4: Transaction details (AFTER refresh):"
echo ""

echo "$refreshed" | jq '{
    id: .id,
    asset: .asset,
    quantity: .quantity,
    price_local: .price_local,
    amount_usd: .amount_usd,
    fx_to_usd: .fx_to_usd,
    date: .date
}'

price_after=$(echo "$refreshed" | jq -r '.price_local')
amount_after=$(echo "$refreshed" | jq -r '.amount_usd')

echo ""
echo "==========================================="
echo "COMPARISON:"
echo "==========================================="
echo "Price Before:  $price_before"
echo "Price After:   $price_after"
echo ""
echo "Amount Before: $amount_before"
echo "Amount After:  $amount_after"
echo ""

# Validate
if [ "$price_after" != "1" ] && [ "$price_after" != "$price_before" ]; then
    echo "✅ SUCCESS: Price was refreshed from CoinGecko!"
    echo "   The price changed from $price_before to $price_after"
elif [ "$price_after" != "1" ]; then
    echo "✅ SUCCESS: Price is correct (not 1)!"
    echo "   Price: $price_after"
else
    echo "❌ FAILED: Price is still 1, refresh didn't work."
fi

echo ""
echo "Test completed!"

