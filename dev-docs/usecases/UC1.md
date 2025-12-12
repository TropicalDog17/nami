# Use Case Template

## 1. Use Case ID
UC-1

## 2. Use Case Name
Create Expense Transaction
## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to record new spending of User


## 5. Preconditions
- User has at least one account to spend from
- User is on any screen where “Add Expense” button is available

## 6. Trigger
User click: "Add Expense" or similar functionaltity button.
---m

## 7. Main Success Scenario (Basic Flow)
1. User clicks “Add Expense”.
2. App displays the expense form.
3. User enters amount, category, account to spend from, and notes.
4. User clicks “Save Expense”.
5. System validates the data.
6. System saves the expense to the database.
7. System shows a success confirmation.


---

## 9. Error Flows

E1 – User enters negative amount

- System detects invalid amount.
- System shows an error message.
- System does NOT save the expense.

E2 – Database write fails

- System fails to save the expense.
- System shows “Unable to save expense.”
- System logs the error.
---

## 10. Postconditions

### Success
- The expense transaction is recorded in the database
- A new expense rows is shown in the Transaction page
- The Account balance is deducted
- The Cashflow outflow is increased

### Failure
- 
- No new record is recorded in the database
- No new row added in the Transaction page
- Everything stay the same
---

