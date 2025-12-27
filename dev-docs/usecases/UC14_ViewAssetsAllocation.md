# Use Case: View Assets Allocation

## 1. Use Case ID
UC-14

## 2. Use Case Name
View Assets Allocation

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to view the allocation and distribution of assets across different asset types and accounts

## 5. Preconditions
- User is logged in
- User has at least one asset or investment holding
- User is on the Portfolio, Assets Allocation, or Analytics screen

## 6. Trigger
User navigates to the Assets Allocation screen, or clicks "View Assets Allocation" button.

## 7. Main Success Scenario (Basic Flow)
1. User navigates to the Assets Allocation screen.
2. System retrieves all asset holdings for the user.
3. System calculates current value for each asset (using current market price).
4. System calculates total portfolio value.
5. System calculates allocation percentage for each asset type.
6. System calculates allocation percentage for each account.
7. System displays assets allocation with pie charts or other visualizations.
8. System optionally shows comparison with target allocation if set.

## 9. Error Flows

E1 – No assets found
- System detects user has no assets.
- System shows a message "No assets recorded yet."
- System displays empty assets allocation view with 0 values.

E2 – Database query fails
- System fails to retrieve asset data.
- System shows "Unable to load assets allocation data."
- System logs the error.

E3 – Unable to fetch current asset prices
- System fails to retrieve current market prices for assets.
- System displays allocation with last known prices.
- System shows a warning message about price freshness.

E4 – Invalid asset or account
- System detects asset or account no longer exists.
- System removes it from the display.
- System logs the error.

E5 – Zero total portfolio value
- System detects total portfolio value is 0.
- System shows a message "No assets with value."
- System displays empty allocation view.

## 10. Postconditions

### Success
- Assets allocation data is displayed to the user
- Pie charts or visualizations show allocation by asset type
- Allocation percentages are calculated and displayed
- User can see breakdown by account if available
- User can see comparison with target allocation if set

### Failure
- Assets allocation data is not displayed
- User sees error message
- User cannot view assets allocation information

