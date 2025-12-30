import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { config } from "./core/config";
import { logger } from "./core/logger";
import { errorHandler, requestLogger, notFoundHandler } from "./core/middleware";

import { transactionsRouter } from "./handlers/transaction.handler";
import { reportsRouter } from "./handlers/reports.handler";
import { actionsRouter } from "./handlers/actions.handler";
import { pricesRouter } from "./handlers/prices.handler";
import { openapiSpec } from "./openapi";
import { vaultsRouter } from "./handlers/vault.handler";
import { consVaultsRouter } from "./handlers/cons-vaults.handler";
import { adminRouter } from "./handlers/admin.handler";
import { loansRouter } from "./handlers/loan.handler";
import { aiRouter } from "./handlers/ai.handler";
import { settingsRepository } from "./repositories";
import { vaultService } from "./services/vault.service";
import { initializeDatabase, closeConnection } from "./database/connection";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging (in development)
if (config.isDevelopment) {
  app.use(requestLogger);
}

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api", transactionsRouter);
app.use("/api", reportsRouter);
app.use("/api", actionsRouter);
app.use("/api", pricesRouter);
app.use("/api", vaultsRouter);
app.use("/api", consVaultsRouter);
app.use("/api", adminRouter);
app.use("/api", loansRouter);
app.use("/api", aiRouter);

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, { explorer: true }),
);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

async function bootstrap() {
  try {
    // Initialize database if using database backend
    if (config.storageBackend === 'database') {
      initializeDatabase();
      logger.info('Database initialized');
    }

    // Ensure default vaults exist at startup
    const defaultSpendingVault = settingsRepository.getDefaultSpendingVaultName();
    const defaultIncomeVault = settingsRepository.getDefaultIncomeVaultName();
    vaultService.ensureVault(defaultSpendingVault);
    vaultService.ensureVault(defaultIncomeVault);

    // Initialize borrowing settings
    settingsRepository.getBorrowingSettings();

    logger.info('Initialization complete.', {
      spendingVault: defaultSpendingVault,
      incomeVault: defaultIncomeVault,
      storageBackend: config.storageBackend,
    });
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? String(e);
    logger.error('Bootstrap failed', e instanceof Error ? e : undefined, { message: msg });
  }
}

const PORT = config.port;
bootstrap().finally(() => {
  app.listen(PORT, () => {
    logger.info(`Portfolio backend listening`, { url: `http://localhost:${PORT}` });
    logger.info(`Swagger UI available`, { url: `http://localhost:${PORT}/api/docs` });
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  closeConnection();
  process.exit(0);
});
