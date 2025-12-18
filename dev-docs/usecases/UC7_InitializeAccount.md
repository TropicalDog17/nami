# Use Case: Initialize Account

## 1. Use Case ID
UC-7

## 2. Use Case Name
Initialize Account (Set Initial Balance)

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to set the initial balance for an existing account

## 5. Preconditions
- User has created an account but not yet initialized it
- User is on the Account details or settings screen
- Account balance is currently 0 or uninitialized

## 6. Trigger
User click: "Initialize Balance", "Set Starting Balance", or similar functionality button on an uninitialized account.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Initialize Balance".
2. App displays the balance initialization form.
3. User enters the initial balance amount.
4. User optionally enters notes about the initial balance.
5. User clicks "Confirm".
6. System validates the data.
7. System saves the initialization transaction to the database.
8. System updates the account balance.
9. System shows a success confirmation.

## 9. Error Flows

E1 – User enters negative amount
- System detects invalid amount.
- System shows an error message.
- System does NOT initialize the balance.

E2 – Account is already initialized
- System detects account already has a non-zero balance.
- System shows an error message or confirmation dialog.
- System does NOT initialize the balance (or requires explicit override).

E3 – Invalid account
- System detects account does not exist or is inactive.
- System shows an error message.
- System does NOT initialize the balance.

E4 – Database write fails
- System fails to save the initialization.
- System shows "Unable to initialize balance."
- System logs the error.

## 10. Postconditions

### Success
- The initialization transaction is recorded in the database
- The account balance is set to the specified amount
- The account is now active and ready to use
- The initialization appears in the account transaction history

### Failure
- No initialization transaction is recorded
- Account balance remains unchanged
- Everything stays the same

