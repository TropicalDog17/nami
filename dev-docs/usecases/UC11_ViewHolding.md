# Use Case: View Holding

## 1. Use Case ID
UC-11

## 2. Use Case Name
View Holding (Assets and Investments)

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to view all current holdings (assets, investments, account balances)

## 5. Preconditions
- User is logged in
- User has at least one account or investment
- User is on the Portfolio, Holdings, or Assets screen

## 6. Trigger
User navigates to the Holdings/Portfolio screen, or clicks "View Holdings" button.

## 7. Main Success Scenario (Basic Flow)
1. User navigates to the Holdings screen.
2. System retrieves all accounts, vaults, and asset holdings for the user.
3. System calculates current balance for each account.
4. System calculates current value for each asset (using current market price if applicable).
5. System calculates total portfolio value.
6. System displays holdings summary with breakdown by account/asset type.
7. System optionally displays holdings in charts/graphs.

## 9. Error Flows

E1 – No holdings found
- System detects user has no accounts or investments.
- System shows a message "No holdings recorded yet."
- System displays empty holdings view with 0 values.

E2 – Database query fails
- System fails to retrieve holdings data.
- System shows "Unable to load holdings data."
- System logs the error.

E3 – Unable to fetch current asset prices
- System fails to retrieve current market prices for assets.
- System displays holdings with last known prices.
- System shows a warning message about price freshness.

E4 – Invalid account or vault
- System detects account or vault no longer exists.
- System removes it from the display.
- System logs the error.

## 10. Postconditions

### Success
- Holdings summary is displayed to the user
- All accounts, vaults, and assets are shown with current values
- Total portfolio value is calculated and displayed
- User can see breakdown by account type or asset type
- Charts/graphs show portfolio composition if available

### Failure
- Holdings data is not displayed
- User sees error message
- User cannot view holdings information

