import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { openapiSpec } from "../src/openapi";
import {
  errorHandler,
  requestLogger,
  notFoundHandler,
} from "../src/core/middleware";

import {
  transactionsRouter,
  reportsRouter,
  actionsRouter,
  pricesRouter,
  vaultsRouter,
  adminRouter,
  loansRouter,
  aiRouter,
} from "../src/handlers";
import { settingsRepository } from "../src/repositories";
import { vaultService } from "../src/services";
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
  }),
);

// API routes
app.use("/api", [
  transactionsRouter,
  reportsRouter,
  actionsRouter,
  pricesRouter,
  vaultsRouter,
  adminRouter,
  loansRouter,
  aiRouter,
]);

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

// Serve Swagger UI at /api/docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, swaggerOptions));

// Serve Swagger UI at /swagger - use combined serve and setup for proper static file handling
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(openapiSpec, swaggerOptions));

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
