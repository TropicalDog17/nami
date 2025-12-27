# Use Case: View Investment Performance (Vault)

## 1. Use Case ID
UC-12

## 2. Use Case Name
View Investment Performance (Vault)

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to view the performance metrics of vault-based investments

## 5. Preconditions
- User is logged in
- User has at least one vault with investments
- User is on the Investment Performance or Vault Details screen

## 6. Trigger
User navigates to the Investment Performance screen, or clicks "View Performance" on a specific vault.

## 7. Main Success Scenario (Basic Flow)
1. User navigates to the Investment Performance screen or selects a vault.
2. System retrieves all investments in the vault.
3. System calculates total invested amount.
4. System calculates current vault value.
5. System calculates gain/loss (current value - invested amount).
6. System calculates return percentage ((current value - invested amount) / invested amount * 100).
7. System displays performance metrics with charts/graphs.
8. System optionally displays performance over time (daily, weekly, monthly, yearly).

## 9. Error Flows

E1 – No vault investments found
- System detects vault has no investments.
- System shows a message "No investments in this vault yet."
- System displays empty performance view with 0 values.

E2 – Database query fails
- System fails to retrieve vault investment data.
- System shows "Unable to load investment performance data."
- System logs the error.

E3 – Invalid vault
- System detects vault does not exist or is inactive.
- System shows an error message.
- System does NOT display performance data.

E4 – Unable to calculate performance
- System fails to calculate performance metrics.
- System shows "Unable to calculate performance."
- System logs the error.

E5 – Invalid time period filter
- System detects invalid date range or period.
- System shows an error message.
- System displays default time period (all time).

## 10. Postconditions

### Success
- Investment performance metrics are displayed to the user
- Gain/loss and return percentage are shown
- Charts/graphs show performance trends over time
- User can filter by time period if available
- User can see detailed breakdown of investments in the vault

### Failure
- Performance data is not displayed
- User sees error message
- User cannot view investment performance information

