import promClient from 'prom-client';

export interface CustomMetrics {
  transactionCreations: promClient.Counter<string>;
  vaultOperations: promClient.Counter<string>;
  databaseOperations: promClient.Counter<string>;
  databaseErrors: promClient.Counter<string>;
}

export function createCustomMetrics(register: promClient.Registry): CustomMetrics {
  return {
    transactionCreations: new promClient.Counter({
      name: 'nami_transactions_total',
      help: 'Total number of transactions created',
      labelNames: ['type', 'status'] as const,
      registers: [register],
    }),

    vaultOperations: new promClient.Counter({
      name: 'nami_vault_operations_total',
      help: 'Total number of vault operations',
      labelNames: ['operation', 'status'] as const,
      registers: [register],
    }),

    databaseOperations: new promClient.Counter({
      name: 'nami_database_operations_total',
      help: 'Total number of database operations',
      labelNames: ['operation', 'table', 'status'] as const,
      registers: [register],
    }),

    databaseErrors: new promClient.Counter({
      name: 'nami_database_errors_total',
      help: 'Total number of database errors',
      labelNames: ['operation', 'error_type'] as const,
      registers: [register],
    }),
  };
}
