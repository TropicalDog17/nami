# Use Case: Create Vault

## 1. Use Case ID
UC-6

## 2. Use Case Name
Create Vault

## 3. Actor(s)
- Primary Actor: User

## 4. Goal
Able to create a new vault for managing investments

## 5. Preconditions
- User is logged in
- User is on the Vault management screen or settings where "Create Vault" button is available

## 6. Trigger
User click: "Create Vault", "New Vault", or similar functionality button.

## 7. Main Success Scenario (Basic Flow)
1. User clicks "Create Vault".
2. App displays the vault creation form.
3. User enters vault name, description, and investment strategy/type.
4. User optionally sets initial balance or target amount.
5. User clicks "Create Vault".
6. System validates the data.
7. System saves the vault to the database.
8. System initializes vault balance to 0 or initial amount if provided.
9. System shows a success confirmation.

## 9. Error Flows

E1 – User enters empty vault name
- System detects missing required field.
- System shows an error message.
- System does NOT create the vault.

E2 – User enters duplicate vault name
- System detects vault with same name already exists.
- System shows an error message.
- System does NOT create the vault.

E3 – User enters negative initial balance
- System detects invalid amount.
- System shows an error message.
- System does NOT create the vault.

E4 – Invalid vault type/strategy
- System detects invalid investment strategy.
- System shows an error message.
- System does NOT create the vault.

E5 – Database write fails
- System fails to save the vault.
- System shows "Unable to create vault."
- System logs the error.

## 10. Postconditions

### Success
- The vault is recorded in the database
- The vault appears in the vault list
- The vault is ready to receive investments
- Vault balance is initialized to 0 or specified initial amount

### Failure
- No new vault is created
- No vault appears in the vault list
- Everything stays the same

