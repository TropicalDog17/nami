# Holdings Percentage Feature

## Summary
Added portfolio percentage calculation to holdings reports, allowing users to see what percentage of their total portfolio each holding represents.

## Changes Made

### 1. Model Updates
- Added `Percentage` field to `Holding` struct in `/internal/models/reporting.go`
- The percentage represents the proportion of total portfolio value (USD) that each holding represents

### 2. Service Layer Updates
- Modified `GetHoldings()` method to calculate percentages based on USD values
- Updated `GetHoldingsByAsset()` to recalculate percentages after aggregation
- `GetHoldingsByAccount()` inherits percentages from `GetHoldings()`

### 3. API Documentation
- Updated Swagger documentation for holdings endpoints to mention percentage calculations

### 4. Test Coverage
- Added comprehensive tests to verify percentage calculation accuracy
- Tests cover both individual holdings and aggregated holdings by asset

## API Response Example

### GET /api/reports/holdings
```json
[
  {
    "asset": "BTC",
    "account": "Binance",
    "quantity": "0.1",
    "value_usd": "5000.00",
    "value_vnd": "125000000.00",
    "percentage": "50.00",  // NEW: 50% of portfolio
    "last_updated": "2025-01-15T00:00:00Z"
  },
  {
    "asset": "ETH",
    "account": "Binance",
    "quantity": "1.0",
    "value_usd": "3000.00",
    "value_vnd": "75000000.00",
    "percentage": "30.00",  // NEW: 30% of portfolio
    "last_updated": "2025-01-15T00:00:00Z"
  },
  {
    "asset": "USDT",
    "account": "Binance",
    "quantity": "2000.0",
    "value_usd": "2000.00",
    "value_vnd": "50000000.00",
    "percentage": "20.00",  // NEW: 20% of portfolio
    "last_updated": "2025-01-15T00:00:00Z"
  }
]
```

### GET /api/reports/holdings/summary
```json
{
  "total_value_usd": "10000.00",
  "total_value_vnd": "250000000.00",
  "by_asset": {
    "BTC": {
      "asset": "BTC",
      "account": "All Accounts",
      "quantity": "0.1",
      "value_usd": "5000.00",
      "value_vnd": "125000000.00",
      "percentage": "50.00",  // Percentage of total portfolio
      "last_updated": "2025-01-15T00:00:00Z"
    },
    "ETH": {
      "asset": "ETH",
      "account": "All Accounts",
      "quantity": "1.0",
      "value_usd": "3000.00",
      "value_vnd": "75000000.00",
      "percentage": "30.00",  // Percentage of total portfolio
      "last_updated": "2025-01-15T00:00:00Z"
    },
    "USDT": {
      "asset": "USDT",
      "account": "All Accounts",
      "quantity": "2000.0",
      "value_usd": "2000.00",
      "value_vnd": "50000000.00",
      "percentage": "20.00",  // Percentage of total portfolio
      "last_updated": "2025-01-15T00:00:00Z"
    }
  },
  "by_account": {
    "Binance": [
      // Individual holdings with their percentages
    ]
  },
  "last_updated": "2025-01-15T00:00:00Z"
}
```

## Implementation Details

### Percentage Calculation Logic
1. Percentages are calculated based on USD values (not VND or quantities)
2. Formula: `(holding_value_usd / total_portfolio_value_usd) * 100`
3. Percentages are rounded to maintain decimal precision
4. If total portfolio value is zero, all percentages are zero

### Edge Cases Handled
- Zero total portfolio value → All percentages are zero
- Holdings with zero value → Zero percentage
- Aggregated holdings (by asset) → Percentages recalculated after aggregation

### Testing
- Comprehensive test coverage for basic percentage calculations
- Tests for aggregated holdings scenarios
- Precision tolerance handling for floating-point calculations

## Benefits
- Users can quickly identify portfolio concentration
- Easy to see asset allocation at a glance
- Helps with portfolio rebalancing decisions
- Better visualization of portfolio composition