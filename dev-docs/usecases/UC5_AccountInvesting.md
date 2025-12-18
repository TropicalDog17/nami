# Use Case: Create Account-Based Investment Transaction

## 1. Use Case ID
UC-5

## 2. Use Case Name
Create Account-Based Investment Transaction (Buy Assets)

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to invest money by purchasing assets (Bitcoin, Gold, Stocks, etc.) directly into an account

## 5. Preconditions
- User has at least one investment account created
- User has at least one source account with sufficient balance
- User is on the Investment or Assets screen where "Buy Asset" button is available
- Asset types are available in the system (Bitcoin, Gold, etc.)

## 6. Trigger
User click: "Buy Asset", "Invest in Asset", or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Buy Asset".
2. App displays the asset purchase form.
3. User selects asset type (Bitcoin, Gold, etc.).
4. User enters quantity or amount to invest.
5. User selects source account to spend from.
6. User clicks "Confirm Purchase".
7. System validates the data and checks account balance.
8. System calculates asset quantity based on current market price.
9. System saves the asset purchase transaction to the database.
10. System updates the investment account with new asset holdings.
11. System deducts amount from source account.
12. System shows a success confirmation with asset details.

## 9. Error Flows

E1 – User enters negative quantity/amount
- System detects invalid input.
- System shows an error message.
- System does NOT save the purchase.

E2 – Insufficient account balance
- System detects source account balance is less than investment amount.
- System shows "Insufficient balance" error message.
- System does NOT save the purchase.

E3 – Invalid asset type
- System detects asset type does not exist or is unavailable.
- System shows an error message.
- System does NOT save the purchase.

E4 – User selects invalid investment account
- System detects investment account does not exist or is inactive.
- System shows an error message.
- System does NOT save the purchase.

E5 – User selects invalid source account
- System detects source account does not exist or is inactive.
- System shows an error message.
- System does NOT save the purchase.

E6 – Unable to fetch current asset price
- System fails to retrieve current market price for the asset.
- System shows "Unable to fetch asset price" error message.
- System does NOT save the purchase.

E7 – Database write fails
- System fails to save the purchase.
- System shows "Unable to save purchase."
- System logs the error.

## 10. Postconditions

### Success
- The asset purchase transaction is recorded in the database
- A new asset holding is recorded in the investment account
- A new transaction row is shown in the Investment/Assets page
- The source account balance is deducted
- The investment account now holds the purchased asset
- The Cashflow outflow is increased

### Failure
- No new record is recorded in the database
- No new asset holding is added
- No new row added in the Investment page
- Everything stays the same

