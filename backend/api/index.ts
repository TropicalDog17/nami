import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { config } from "../src/core/config";
import {
  errorHandler,
  requestLogger,
  notFoundHandler,
} from "../src/core/middleware";

import { transactionsRouter } from "../src/handlers/transaction.handler";
import { reportsRouter } from "../src/handlers/reports.handler";
import { actionsRouter } from "../src/handlers/actions.handler";
import { pricesRouter } from "../src/handlers/prices.handler";
import { openapiSpec } from "../src/openapi";
import { vaultsRouter } from "../src/handlers/vault.handler";
import { consVaultsRouter } from "../src/handlers/cons-vaults.handler";
import { adminRouter } from "../src/handlers/admin.handler";
import { loansRouter } from "../src/handlers/loan.handler";
import { aiRouter } from "../src/handlers/ai.handler";
import { settingsRepository } from "../src/repositories";
import { vaultService } from "../src/services/vault.service";
import { initializeDatabase } from "../src/database/connection";
import { setupMonitoring, setMetrics } from "../src/monitoring";
import { logger } from "../src/utils/logger";

const app = express();

// Setup monitoring
const { metricsMiddleware, registerMetricsEndpoint, metrics } =
  setupMonitoring(app);
app.use(metricsMiddleware);
setMetrics(metrics);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
);

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

// Metrics endpoint for Prometheus scraping
registerMetricsEndpoint();

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));

// Swagger UI options to prevent caching issues
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    url: "/api/openapi.json",
  },
};

app.use("/api/docs", swaggerUi.serve);
app.get("/api/docs", swaggerUi.setup(openapiSpec, swaggerOptions));

// Also serve at /swagger/index.html for production
app.use("/swagger", swaggerUi.serve);
app.get("/swagger/", swaggerUi.setup(openapiSpec, swaggerOptions));
app.get("/swagger/index.html", swaggerUi.setup(openapiSpec, swaggerOptions));

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// Initialize on cold start
let initialized = false;

function ensureInitialized() {
  if (initialized) return;

  try {
    // Initialize database if using database backend
    if (process.env.STORAGE_BACKEND === "database") {
      initializeDatabase();
      logger.info("Database initialized");
    }

    // Ensure default vaults exist at startup
    const defaultSpendingVault =
      settingsRepository.getDefaultSpendingVaultName();
    const defaultIncomeVault = settingsRepository.getDefaultIncomeVaultName();
    vaultService.ensureVault(defaultSpendingVault);
    vaultService.ensureVault(defaultIncomeVault);

    // Initialize borrowing settings
    settingsRepository.getBorrowingSettings();

    logger.info("Initialization complete.");
    initialized = true;
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? String(e);
    logger.error({ error: msg }, "Bootstrap failed");
  }
}

// Vercel serverless handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  ensureInitialized();
  return app(req as any, res as any);
}
