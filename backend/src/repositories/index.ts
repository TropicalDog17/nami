// Factory for creating repository instances based on STORAGE_BACKEND environment variable
const backend = process.env.STORAGE_BACKEND || "json";

console.log(`Using storage backend: ${backend}`);

// Transaction repository
export const transactionRepository =
  backend === "database"
    ? new (require("./transaction.repository").TransactionRepositoryDb)()
    : new (require("./transaction.repository").TransactionRepositoryJson)();

// Vault repository
export const vaultRepository =
  backend === "database"
    ? new (require("./vault.repository").VaultRepositoryDb)()
    : new (require("./vault.repository").VaultRepositoryJson)();

// Loan repository
export const loanRepository =
  backend === "database"
    ? new (require("./loan.repository").LoanRepositoryDb)()
    : new (require("./loan.repository").LoanRepositoryJson)();

// Admin repository
export const adminRepository =
  backend === "database"
    ? new (require("./admin.repository").AdminRepositoryDb)()
    : new (require("./admin.repository").AdminRepositoryJson)();

// Pending actions repository
export const pendingActionsRepository =
  backend === "database"
    ? new (require("./admin.repository").PendingActionsRepositoryDb)()
    : new (require("./admin.repository").PendingActionsRepositoryJson)();

// Settings repository
export const settingsRepository =
  backend === "database"
    ? new (require("./settings.repository").SettingsRepositoryDb)()
    : new (require("./settings.repository").SettingsRepositoryJson)();

// Export classes for type imports and testing
export {
  TransactionRepositoryJson,
  TransactionRepositoryDb,
} from "./transaction.repository";

export { VaultRepositoryJson, VaultRepositoryDb } from "./vault.repository";

export { LoanRepositoryJson, LoanRepositoryDb } from "./loan.repository";

export {
  AdminRepositoryJson,
  AdminRepositoryDb,
  PendingActionsRepositoryJson,
  PendingActionsRepositoryDb,
} from "./admin.repository";

export {
  SettingsRepositoryJson,
  SettingsRepositoryDb,
} from "./settings.repository";

export * from "./base.repository";
export * from "./repository.interface";
