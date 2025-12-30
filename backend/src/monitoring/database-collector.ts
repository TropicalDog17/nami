import promClient from 'prom-client';
import { CustomMetrics } from './metrics';

export function registerDatabaseMetrics(
  register: promClient.Registry,
  metrics: CustomMetrics,
): void {
  const dbSizeGauge = new promClient.Gauge({
    name: 'nami_database_size_bytes',
    help: 'Size of the SQLite database file in bytes',
    registers: [register],
  });

  const activeConnectionsGauge = new promClient.Gauge({
    name: 'nami_database_active_connections',
    help: 'Number of active database connections',
    registers: [register],
  });

  // Collect metrics every 15 seconds
  const collectInterval = setInterval(() => {
    try {
      // Dynamic import to avoid circular dependency
      import('../database/connection').then(({ getConnection }) => {
        const db = getConnection();

        // Get database size
        const sizeResult = db
          .prepare(
            'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()',
          )
          .get() as { size: number } | undefined;
        if (sizeResult) {
          dbSizeGauge.set(sizeResult.size);
        }

        // SQLite is single-connection per file
        activeConnectionsGauge.set(1);
      });
    } catch (error) {
      metrics.databaseErrors.inc({
        operation: 'metrics_collection',
        error_type: 'collection_failed',
      });
    }
  }, 15000);

  // Cleanup on process exit
  process.on('beforeExit', () => {
    clearInterval(collectInterval);
  });
}
