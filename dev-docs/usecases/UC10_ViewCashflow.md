# Use Case: View Cashflow

## 1. Use Case ID
UC-10

## 2. Use Case Name
View Cashflow

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to view the cashflow summary (inflow, outflow, net flow)

## 5. Preconditions
- User is logged in
- User has at least one transaction recorded
- User is on the Dashboard or Cashflow screen

## 6. Trigger
User navigates to the Cashflow or Dashboard screen, or clicks "View Cashflow" button.

## 7. Main Success Scenario (Basic Flow)
1. User navigates to the Cashflow screen.
2. System retrieves all transactions for the user.
3. System calculates total inflow (income, transfers in).
4. System calculates total outflow (expenses, transfers out, investments).
5. System calculates net cashflow (inflow - outflow).
6. System displays cashflow summary with charts/graphs.
7. System optionally displays cashflow by time period (daily, weekly, monthly, yearly).

## 9. Error Flows

E1 – No transactions found
- System detects user has no transactions.
- System shows a message "No transactions recorded yet."
- System displays empty cashflow view with 0 values.

E2 – Database query fails
- System fails to retrieve transaction data.
- System shows "Unable to load cashflow data."
- System logs the error.

E3 – Invalid time period filter
- System detects invalid date range or period.
- System shows an error message.
- System displays default time period (current month).

## 10. Postconditions

### Success
- Cashflow summary is displayed to the user
- Charts/graphs show inflow, outflow, and net flow
- User can see cashflow trends over time
- User can filter by time period if available

### Failure
- Cashflow data is not displayed
- User sees error message
- User cannot view cashflow information

