# Use Case: Create Vault-Based Investment Transaction

## 1. Use Case ID
UC-4

## 2. Use Case Name
Create Vault-Based Investment Transaction

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to invest money into a vault (managed investment portfolio)

## 5. Preconditions
- User has at least one vault created
- User has at least one account with sufficient balance to invest
- User is on the Investment or Vault screen where "Invest in Vault" button is available

## 6. Trigger
User click: "Invest in Vault", "Add to Vault", or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Invest in Vault".
2. App displays the vault investment form.
3. User selects a vault and source account.
4. User enters investment amount and notes.
5. User clicks "Confirm Investment".
6. System validates the data and checks account balance.
7. System saves the investment transaction to the database.
8. System updates the vault balance and account balance.
9. System shows a success confirmation.

## 9. Error Flows

E1 – User enters negative amount
- System detects invalid amount.
- System shows an error message.
- System does NOT save the investment.

E2 – Insufficient account balance
- System detects account balance is less than investment amount.
- System shows "Insufficient balance" error message.
- System does NOT save the investment.

E3 – User selects invalid vault
- System detects vault does not exist or is inactive.
- System shows an error message.
- System does NOT save the investment.

E4 – User selects invalid source account
- System detects account does not exist or is inactive.
- System shows an error message.
- System does NOT save the investment.

E5 – Database write fails
- System fails to save the investment.
- System shows "Unable to save investment."
- System logs the error.

## 10. Postconditions

### Success
- The investment transaction is recorded in the database
- A new investment row is shown in the Investment/Vault page
- The source account balance is deducted
- The vault balance is increased
- The Cashflow outflow is increased

### Failure
- No new record is recorded in the database
- No new row added in the Investment page
- Everything stays the same

