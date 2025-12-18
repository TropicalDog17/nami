# Use Case: Create Account (Admin)

## 1. Use Case ID
UC-8

## 2. Use Case Name
Create Account (Admin)

## 3. Actor(s)
- Primary Actor: Admin User

## 4. Goal
Able to create a new account for managing money

## 5. Preconditions
- User has admin privileges
- User is on the Account management screen where "Create Account" button is available

## 6. Trigger
Admin click: "Create Account", "New Account", or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. Admin clicks "Create Account".
2. App displays the account creation form.
3. Admin enters account name, account type (Checking, Savings, Investment, etc.), and currency.
4. Admin optionally enters account description and initial balance.
5. Admin clicks "Create Account".
6. System validates the data.
7. System saves the account to the database.
8. System initializes account balance to 0 or specified initial amount.
9. System shows a success confirmation.

## 9. Error Flows

E1 – Admin enters empty account name
- System detects missing required field.
- System shows an error message.
- System does NOT create the account.

E2 – Admin enters duplicate account name
- System detects account with same name already exists.
- System shows an error message.
- System does NOT create the account.

E3 – Invalid account type
- System detects account type does not exist or is invalid.
- System shows an error message.
- System does NOT create the account.

E4 – Invalid currency
- System detects currency is not supported.
- System shows an error message.
- System does NOT create the account.

E5 – Admin enters negative initial balance
- System detects invalid amount.
- System shows an error message.
- System does NOT create the account.

E6 – Insufficient permissions
- System detects user does not have admin privileges.
- System shows "Insufficient permissions" error message.
- System does NOT create the account.

E7 – Database write fails
- System fails to save the account.
- System shows "Unable to create account."
- System logs the error.

## 10. Postconditions

### Success
- The account is recorded in the database
- The account appears in the account list
- The account is ready to use
- Account balance is initialized to 0 or specified initial amount

### Failure
- No new account is created
- No account appears in the account list
- Everything stays the same

