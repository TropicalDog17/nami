/**
 * Repository exports
 * Re-exports from DI container for backward compatibility
 *
 * @deprecated Import from '../core/di' or '../core' directly for new code
 */

import {
  transactionRepository,
  vaultRepository,
  loanRepository,
  adminRepository,
  pendingActionsRepository,
  settingsRepository,
  TransactionRepositoryDb,
  TransactionRepositoryJson,
  VaultRepositoryDb,
  VaultRepositoryJson,
  LoanRepositoryDb,
  LoanRepositoryJson,
  AdminRepositoryDb,
  AdminRepositoryJson,
  PendingActionsRepositoryDb,
  PendingActionsRepositoryJson,
  SettingsRepositoryDb,
  SettingsRepositoryJson,
} from "../core/di";

// Re-export repository instances (backward compatibility)
export {
  transactionRepository,
  vaultRepository,
  loanRepository,
  adminRepository,
  pendingActionsRepository,
  settingsRepository,
};

// Export classes for type imports and testing
export {
  TransactionRepositoryJson,
  TransactionRepositoryDb,
  VaultRepositoryJson,
  VaultRepositoryDb,
  LoanRepositoryJson,
  LoanRepositoryDb,
  AdminRepositoryJson,
  AdminRepositoryDb,
  PendingActionsRepositoryJson,
  PendingActionsRepositoryDb,
  SettingsRepositoryJson,
  SettingsRepositoryDb,
};

// Export other repository types
export * from "./base.repository";
export * from "./repository.interface";
