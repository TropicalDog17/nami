# FX Rate Inference Changes

## Overview

The Nami system has been updated to **automatically infer FX rates** instead of requiring them to be provided per transaction. This simplifies transaction creation and reduces API complexity.

## Changes Made

### ✅ **Backend Changes**

#### 1. Transaction Model Updates
- **Added**: `LocalCurrency` field to specify the currency of the transaction
- **Made Optional**: `FXToUSD` and `FXToVND` fields are now optional (nullable in database)
- **Removed Validation**: FX rates are no longer required during transaction validation
- **Smart Calculation**: Derived fields are only calculated when FX rates are available

#### 2. Transaction Service Auto-Inference
- **Enhanced**: `populateFXRates()` method now uses `LocalCurrency` as base
- **Smart Logic**:
  - USD transactions: `FXToUSD = 1.0` automatically
  - VND transactions: `FXToVND = 1.0` automatically
  - Cryptocurrency: FX rates set to 1.0 (valuation via price providers)
  - Other currencies: Fetch rates from FX provider

#### 3. Validation Changes
```go
// Before: FX rates required
if tx.FXToUSD.IsZero() {
    return errors.New("FX to USD rate is required")
}

// After: FX rates optional, local currency required
if tx.LocalCurrency == "" {
    return errors.New("local_currency is required")
}
```

### ✅ **AI Service Impact**

**No Changes Required!** The AI service already works correctly:
- Creates `PendingActionCreate` objects without FX rates
- Backend automatically handles FX rate inference when processing
- No API changes needed

## Database Schema Changes

### Column Updates
```sql
-- Make FX rates nullable (if not already)
ALTER TABLE transactions
ALTER COLUMN fx_to_usd DROP NOT NULL,
ALTER COLUMN fx_to_vnd DROP NOT NULL;

-- Add local currency column (if not exists)
ALTER TABLE transactions
ADD COLUMN local_currency VARCHAR(10) NOT NULL DEFAULT 'USD';
```

## Usage Examples

### Creating Transactions

#### Before (Required FX Rates)
```json
{
  "type": "expense",
  "account": "Bank",
  "quantity": 100,
  "price_local": 1.5,
  "fx_to_usd": 1.0,
  "fx_to_vnd": 23500
}
```

#### After (Automatic FX Inference)
```json
{
  "type": "expense",
  "account": "Bank",
  "quantity": 100,
  "price_local": 1.5,
  "local_currency": "USD"
}
```

### Backend Processing

The backend will automatically:
1. Detect missing FX rates
2. Determine needed rates based on `LocalCurrency`
3. Fetch rates from FX provider
4. Apply rates and calculate derived fields
5. Save transaction with inferred FX data

## Migration Notes

### Breaking Changes
1. **API Contracts**: Frontend/clients must now provide `LocalCurrency` field
2. **Database**: Requires schema migration for new column
3. **Tests**: Integration tests need to be updated with `LocalCurrency`

### Migration Steps
1. **Database Migration**: Run SQL to add `local_currency` column
2. **Frontend Updates**: Add currency selection to transaction forms
3. **Backward Compatibility**: Set default currency based on account type
4. **Test Updates**: Add `LocalCurrency` to all test transactions

## Benefits

1. **Simplified API**: No need to calculate FX rates on client side
2. **Consistent Rates**: All FX rates from single source of truth
3. **Reduced Errors**: Eliminates FX rate calculation errors
4. **Better UX**: Users don't need to know FX rates
5. **Maintainable**: Single place for FX rate logic

## Error Handling

The system gracefully handles:
- **Missing FX Provider**: Skips auto-inference, leaves rates empty
- **Unavailable Rates**: Returns clear error messages
- **Unsupported Currencies**: Validation with helpful messages
- **Cryptocurrencies**: Smart handling with 1.0 rates

## Testing

### New Tests Added
- Model validation with/without `LocalCurrency`
- FX rate inference logic
- Derived field calculation
- USD/VND transaction handling

### Tests Requiring Updates
- Integration tests using direct transaction creation
- Transaction service tests
- Vault and stake tests

## Rollback Plan

If issues arise:
1. **Revert**: Make FX rates required again
2. **Fallback**: Use previous validation logic
3. **Migration**: Remove `LocalCurrency` column
4. **Compatibility**: Maintain old API contracts