# Use Case: Create Credit Spending Transaction

## 1. Use Case ID
UC-3

## 2. Use Case Name
Create Credit Spending Transaction

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to record spending using credit (credit card, loan, etc.) and correctly reflect it in the credit account flow.

## 5. Preconditions
- User has at least one credit account configured
- User is on any screen where "Add Credit Spending" button is available

## 6. Trigger
User clicks: "Add Credit Spending" or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Add Credit Spending".
2. App displays the credit spending form.
3. User enters amount, category, credit account, due date, and notes.
4. User clicks "Save Credit Spending".
5. System validates the data.
6. System saves the credit spending to the database.
7. System:
   - Adds the transaction as an **outflow from the credit account** (not cash).
   - Marks the transaction as **Credit Spending** type.
8. System shows a success confirmation.

## 8. Error Flows

**E1 – User enters negative amount**  
- System detects invalid amount.  
- System shows an error message.  
- System does NOT save the credit spending.  

**E2 – User enters invalid due date**  
- System detects due date is in the past or invalid format.  
- System shows an error message.  
- System does NOT save the credit spending.  

**E3 – User selects invalid credit account**  
- System detects credit account does not exist or is inactive.  
- System shows an error message.  
- System does NOT save the credit spending.  

**E4 – Database write fails**  
- System fails to save the credit spending.  
- System shows "Unable to save credit spending."  
- System logs the error.

## 9. Postconditions

### Success
- The credit spending transaction is recorded in the database.  
- A new credit spending row is shown in the Transaction page.  
- The **Credit account balance is increased** (debt increased).  
- **Cashflow outflow is not affected** (spending is from credit, not cash).  

### Failure
- No new record is recorded in the database.  
- No new row is added in the Transaction page.  
- All balances remain unchanged.
