import express from "express";
import cors from "cors";
import { openapiSpec } from "../src/openapi";
import { swaggerHtml } from "../src/swagger";
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
// Increase body size limits for large JSON imports
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ limit: "4mb", extended: true }));

app.get("/health", (_req, res) =>
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    })
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

// Serve Swagger UI at /api/docs and /swagger
app.get(["/api/docs", "/swagger"], (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(swaggerHtml);
});

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
        const defaultIncomeVault =
            settingsRepository.getDefaultIncomeVaultName();
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

// Export the Express app
export default app;
