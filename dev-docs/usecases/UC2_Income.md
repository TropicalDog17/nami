# Use Case: Create Income Transaction

## 1. Use Case ID
UC-2

## 2. Use Case Name
Create Income Transaction

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to record new income/earnings of User

## 5. Preconditions
- User has at least one account to receive income into
- User is on any screen where "Add Income" button is available

## 6. Trigger
User click: "Add Income" or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Add Income".
2. App displays the income form.
3. User enters amount, income source/category, account to receive into, and notes.
4. User clicks "Save Income".
5. System validates the data.
6. System saves the income to the database.
7. System shows a success confirmation.

## 9. Error Flows

E1 – User enters negative amount
- System detects invalid amount.
- System shows an error message.
- System does NOT save the income.

E2 – User selects invalid account
- System detects account does not exist or is inactive.
- System shows an error message.
- System does NOT save the income.

E3 – Database write fails
- System fails to save the income.
- System shows "Unable to save income."
- System logs the error.

## 10. Postconditions

### Success
- The income transaction is recorded in the database
- A new income row is shown in the Transaction page
- The Account balance is increased
- The Cashflow inflow is increased

### Failure
- No new record is recorded in the database
- No new row added in the Transaction page
- Everything stays the same

