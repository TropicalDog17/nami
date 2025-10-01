#!/bin/bash

# Test init_balance action for ETH

echo "Testing init_balance action for ETH..."
echo "======================================="
echo ""

# Test 1: Create init_balance for ETH (will auto-fetch price)
echo "Test 1: Creating init_balance for ETH on 2025-09-25"
echo "This will automatically fetch the ETH price from CoinGecko..."
echo ""

response=$(curl -s 'http://localhost:8080/api/actions' \
  -H 'Accept: */*' \
  -H 'Content-Type: application/json' \
  --data-raw '{"action":"init_balance","params":{"date":"2025-09-25","account":"Binance Spot","asset":"ETH","quantity":"1.35517677076026048"}}')

echo "Response:"
echo "$response" | jq '.'

echo ""
echo "======================================="
echo ""

# Extract transaction details
price_local=$(echo "$response" | jq -r '.transactions[0].price_local // "N/A"')
amount_usd=$(echo "$response" | jq -r '.transactions[0].amount_usd // "N/A"')
amount_vnd=$(echo "$response" | jq -r '.transactions[0].amount_vnd // "N/A"')
fx_to_usd=$(echo "$response" | jq -r '.transactions[0].fx_to_usd // "N/A"')

echo "Summary:"
echo "  ETH Quantity: 1.35517677076026048"
echo "  Price (USD):  $price_local"
echo "  FX to USD:    $fx_to_usd"
echo "  Amount USD:   $amount_usd"
echo "  Amount VND:   $amount_vnd"
echo ""

# Validate
if [ "$price_local" != "1" ] && [ "$price_local" != "N/A" ]; then
    echo "✅ SUCCESS: Price was fetched from CoinGecko!"
    echo "   ETH price is not 1, which means it was properly fetched."
else
    echo "❌ FAILED: Price was not fetched correctly."
    echo "   Price should be the actual ETH price, not 1."
fi

echo ""
echo "Test completed!"

