# Currency switching in transactions table doesn't apply historical FX conversion

## Bug Description
When switching between USD and VND views on the transactions page, the "Amount" column displays the same numerical values regardless of the selected currency. The amounts should be converted using historical foreign exchange rates based on the transaction date, but instead remain static, showing incorrect values when viewing in a different currency than the original transaction currency.

## Environment
- **Application**: Nami Transaction Tracking System
- **Component**: TransactionPage.tsx (lines 828-864)
- **Context**: AppContext.tsx currency management

## Steps to Reproduce
1. Navigate to the Transactions page
2. Ensure you have existing transactions with dates spanning different periods
3. Observe the "Amount" column values in USD view (default)
4. Click the "VND View" button to switch currency
5. Observe that the "Amount" column shows the same numerical values without proper conversion

## Expected Behavior
The "Amount" column should display converted values based on:
- Historical FX rates applicable to each transaction's date
- Proper currency conversion calculation using stored `fx_to_usd` and `fx_to_vnd` rates
- Different numerical values reflecting the historical exchange rate at the time of each transaction

## Current Behavior
The "Amount" column displays identical numerical values when switching between USD and VND views, indicating that:
- No currency conversion is being applied
- Historical FX rates are not being utilized
- The amounts remain static regardless of currency selection

## Screenshots
*(Please add screenshots showing USD view vs VND view with identical values)*

## Potential Root Cause
Based on code analysis, the issue likely stems from:

1. **Table Column Configuration** (TransactionPage.tsx:828): The Amount column uses `currency === 'USD' ? 'amount_usd' : 'amount_vnd'` but may not be applying proper conversion logic.

2. **Missing FX Rate Integration**: The render function displays stored values but may not be applying historical FX conversions based on transaction dates.

3. **Data Availability**: Transactions may not have both `amount_usd` and `amount_vnd` properly calculated with historical rates.

4. **Currency Switching Logic**: The `setCurrency` action in AppContext updates the state but may not trigger amount recalculation.

## Investigation Points
1. Verify that transactions have both `amount_usd` and `amount_vnd` populated with correct historical conversions
2. Check if the amount render function is accessing the correct database fields
3. Test with the "Refresh" button functionality to see if it fixes the display issue
4. **TransactionPage.tsx:828-864** - Amount column render logic
5. **AppContext.tsx:144** - SET_CURRENCY reducer logic
6. **Backend API** - Verify historical FX rate calculation endpoints
7. **Database Schema** - Confirm `amount_usd`, `amount_vnd`, `fx_to_usd`, `fx_to_vnd` fields are properly populated

## Workaround
- Use the "Refresh" button to recalculate FX rates for existing transactions
- This may populate missing `amount_usd` and `amount_vnd` fields

## Acceptance Criteria
- [ ] Currency switching applies historical FX conversion based on transaction dates
- [ ] Amount column shows different numerical values when switching between USD/VND
- [ ] Historical FX rates are correctly applied for each transaction's date
- [ ] User can toggle between currencies without manual refresh
- [ ] Test coverage added for currency conversion functionality

## Priority
**High** - This affects financial reporting accuracy and user trust in the multi-currency functionality.