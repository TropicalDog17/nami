/**
 * Simple dependency injection container
 * Provides centralized service instantiation and dependency management
 */

import {
  ITransactionRepository,
  IVaultRepository,
  ILoanRepository,
  IAdminRepository,
  IPendingActionsRepository,
  ISettingsRepository,
} from '../repositories/repository.interface';
import {
  TransactionRepositoryDb,
  TransactionRepositoryJson,
} from '../repositories/transaction.repository';
import {
  VaultRepositoryDb,
  VaultRepositoryJson,
} from '../repositories/vault.repository';
import {
  LoanRepositoryDb,
  LoanRepositoryJson,
} from '../repositories/loan.repository';
import {
  AdminRepositoryDb,
  AdminRepositoryJson,
  PendingActionsRepositoryDb,
  PendingActionsRepositoryJson,
} from '../repositories/admin.repository';
import {
  SettingsRepositoryDb,
  SettingsRepositoryJson,
} from '../repositories/settings.repository';
import { config } from './config';

/**
 * Repository factory interface
 */
interface RepositoryFactory<T> {
  createDb(): T;
  createJson(): T;
}

/**
 * Create repository based on storage backend configuration
 */
function createRepository<T>(factory: RepositoryFactory<T>): T {
  return config.storageBackend === 'database' ? factory.createDb() : factory.createJson();
}

/**
 * DI Container for all repositories
 */
class DIContainer {
  // Lazy-loaded singletons
  private _transactionRepository?: ReturnType<typeof createTransactionRepository>;
  private _vaultRepository?: ReturnType<typeof createVaultRepository>;
  private _loanRepository?: ReturnType<typeof createLoanRepository>;
  private _adminRepository?: ReturnType<typeof createAdminRepository>;
  private _pendingActionsRepository?: ReturnType<typeof createPendingActionsRepository>;
  private _settingsRepository?: ReturnType<typeof createSettingsRepository>;

  // Transaction repository
  get transactionRepository() {
    if (!this._transactionRepository) {
      this._transactionRepository = createTransactionRepository();
    }
    return this._transactionRepository;
  }

  // Vault repository
  get vaultRepository() {
    if (!this._vaultRepository) {
      this._vaultRepository = createVaultRepository();
    }
    return this._vaultRepository;
  }

  // Loan repository
  get loanRepository() {
    if (!this._loanRepository) {
      this._loanRepository = createLoanRepository();
    }
    return this._loanRepository;
  }

  // Admin repository
  get adminRepository() {
    if (!this._adminRepository) {
      this._adminRepository = createAdminRepository();
    }
    return this._adminRepository;
  }

  // Pending actions repository
  get pendingActionsRepository() {
    if (!this._pendingActionsRepository) {
      this._pendingActionsRepository = createPendingActionsRepository();
    }
    return this._pendingActionsRepository;
  }

  // Settings repository
  get settingsRepository() {
    if (!this._settingsRepository) {
      this._settingsRepository = createSettingsRepository();
    }
    return this._settingsRepository;
  }

  /**
   * Reset all repositories (useful for testing)
   */
  reset(): void {
    this._transactionRepository = undefined;
    this._vaultRepository = undefined;
    this._loanRepository = undefined;
    this._adminRepository = undefined;
    this._pendingActionsRepository = undefined;
    this._settingsRepository = undefined;
  }
}

// Factory functions
function createTransactionRepository(): ITransactionRepository {
  return createRepository<ITransactionRepository>({
    createDb: () => new TransactionRepositoryDb(),
    createJson: () => new TransactionRepositoryJson(),
  });
}

function createVaultRepository(): IVaultRepository {
  return createRepository<IVaultRepository>({
    createDb: () => new VaultRepositoryDb(),
    createJson: () => new VaultRepositoryJson(),
  });
}

function createLoanRepository(): ILoanRepository {
  return createRepository<ILoanRepository>({
    createDb: () => new LoanRepositoryDb(),
    createJson: () => new LoanRepositoryJson(),
  });
}

function createAdminRepository(): IAdminRepository {
  return createRepository<IAdminRepository>({
    createDb: () => new AdminRepositoryDb(),
    createJson: () => new AdminRepositoryJson(),
  });
}

function createPendingActionsRepository(): IPendingActionsRepository {
  return createRepository<IPendingActionsRepository>({
    createDb: () => new PendingActionsRepositoryDb(),
    createJson: () => new PendingActionsRepositoryJson(),
  });
}

function createSettingsRepository(): ISettingsRepository {
  return createRepository<ISettingsRepository>({
    createDb: () => new SettingsRepositoryDb(),
    createJson: () => new SettingsRepositoryJson(),
  });
}

// Singleton instance
export const container = new DIContainer();

// Export convenience accessors
export const repositories = {
  get transaction() { return container.transactionRepository; },
  get vault() { return container.vaultRepository; },
  get loan() { return container.loanRepository; },
  get admin() { return container.adminRepository; },
  get pendingActions() { return container.pendingActionsRepository; },
  get settings() { return container.settingsRepository; },
};

// Export for backward compatibility (will be deprecated)
export const transactionRepository = repositories.transaction;
export const vaultRepository = repositories.vault;
export const loanRepository = repositories.loan;
export const adminRepository = repositories.admin;
export const pendingActionsRepository = repositories.pendingActions;
export const settingsRepository = repositories.settings;

// Export repository classes for type imports and testing
export {
  TransactionRepositoryJson,
  TransactionRepositoryDb,
} from '../repositories/transaction.repository';
export {
  VaultRepositoryJson,
  VaultRepositoryDb,
} from '../repositories/vault.repository';
export {
  LoanRepositoryJson,
  LoanRepositoryDb,
} from '../repositories/loan.repository';
export {
  AdminRepositoryJson,
  AdminRepositoryDb,
  PendingActionsRepositoryJson,
  PendingActionsRepositoryDb,
} from '../repositories/admin.repository';
export {
  SettingsRepositoryJson,
  SettingsRepositoryDb,
} from '../repositories/settings.repository';
