# Use Case: Transfer Between Accounts

## 1. Use Case ID
UC-9

## 2. Use Case Name
Transfer Between Accounts

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to transfer money from one account to another

## 5. Preconditions
- User has at least two accounts
- User has at least one source account with sufficient balance
- User is on the Account or Transfer screen where "Transfer" button is available

## 6. Trigger
User click: "Transfer", "Send Money", or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Transfer".
2. App displays the transfer form.
3. User selects source account and destination account.
4. User enters transfer amount and notes.
5. User clicks "Confirm Transfer".
6. System validates the data and checks source account balance.
7. System saves the transfer transaction to the database.
8. System deducts amount from source account.
9. System adds amount to destination account.
10. System shows a success confirmation.

## 9. Error Flows

E1 – User enters negative amount
- System detects invalid amount.
- System shows an error message.
- System does NOT save the transfer.

E2 – Insufficient source account balance
- System detects source account balance is less than transfer amount.
- System shows "Insufficient balance" error message.
- System does NOT save the transfer.

E3 – User selects same account as source and destination
- System detects source and destination are the same.
- System shows an error message.
- System does NOT save the transfer.

E4 – User selects invalid source account
- System detects source account does not exist or is inactive.
- System shows an error message.
- System does NOT save the transfer.

E5 – User selects invalid destination account
- System detects destination account does not exist or is inactive.
- System shows an error message.
- System does NOT save the transfer.

E6 – Database write fails
- System fails to save the transfer.
- System shows "Unable to save transfer."
- System logs the error.

## 10. Postconditions

### Success
- The transfer transaction is recorded in the database
- A new transfer row is shown in both source and destination account transaction pages
- The source account balance is deducted
- The destination account balance is increased
- The Cashflow remains neutral (internal transfer)

### Failure
- No new record is recorded in the database
- No new row added in the transaction pages
- Everything stays the same

