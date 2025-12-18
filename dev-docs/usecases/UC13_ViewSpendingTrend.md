# Use Case: View Spending Trend

## 1. Use Case ID
UC-13

## 2. Use Case Name
View Spending Trend

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to view spending trends and patterns over time

## 5. Preconditions
- User is logged in
- User has at least one expense transaction recorded
- User is on the Analytics, Reports, or Spending Trend screen

## 6. Trigger
User navigates to the Spending Trend screen, or clicks "View Spending Trends" button.

## 7. Main Success Scenario (Basic Flow)
1. User navigates to the Spending Trend screen.
2. System retrieves all expense transactions for the user.
3. System groups expenses by time period (daily, weekly, monthly, yearly).
4. System calculates total spending for each period.
5. System calculates spending by category.
6. System identifies spending patterns and trends.
7. System displays spending trends with charts/graphs.
8. System optionally shows comparison with previous periods.

## 9. Error Flows

E1 – No expense transactions found
- System detects user has no expenses.
- System shows a message "No expenses recorded yet."
- System displays empty spending trend view with 0 values.

E2 – Database query fails
- System fails to retrieve expense data.
- System shows "Unable to load spending trend data."
- System logs the error.

E3 – Invalid time period filter
- System detects invalid date range or period.
- System shows an error message.
- System displays default time period (current month).

E4 – Invalid category filter
- System detects invalid expense category.
- System shows an error message.
- System displays all categories.

## 10. Postconditions

### Success
- Spending trend data is displayed to the user
- Charts/graphs show spending over time
- Spending breakdown by category is shown
- User can filter by time period and category
- User can see spending patterns and trends

### Failure
- Spending trend data is not displayed
- User sees error message
- User cannot view spending trend information

