import "dotenv/config";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { config } from "./core/config";
import { errorHandler, notFoundHandler } from "./core/middleware";

import { transactionsRouter } from "./handlers/transaction.handler";
import { reportsRouter } from "./handlers/reports.handler";
import { actionsRouter } from "./handlers/actions.handler";
import { pricesRouter } from "./handlers/prices.handler";
import { openapiSpec } from "./openapi";
import { vaultsRouter } from "./handlers/vault.handler";
import { adminRouter } from "./handlers/admin.handler";
import { loansRouter } from "./handlers/loan.handler";
import { borrowingsRouter } from "./handlers/borrowing.handler";
import { aiRouter } from "./handlers/ai.handler";
import { settingsRepository } from "./repositories";
import { vaultService } from "./services/vault.service";
import { initializeDatabase, closeConnection } from "./database/connection";
import { setupMonitoring, setMetrics } from "./monitoring";
import { logger } from "./utils/logger";
import { priceService } from "./services/price.service";
import { borrowingService } from "./services/borrowing.service";

const app = express();

// Setup monitoring FIRST (before routes)
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
app.use("/api", transactionsRouter);
app.use("/api", reportsRouter);
app.use("/api", actionsRouter);
app.use("/api", pricesRouter);
app.use("/api", vaultsRouter);
app.use("/api", adminRouter);
app.use("/api", loansRouter);
app.use("/api", borrowingsRouter);
app.use("/api", aiRouter);

// Metrics endpoint for Prometheus scraping
registerMetricsEndpoint();

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));

// Swagger UI options
const swaggerOptions = {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: {
        persistAuthorization: true,
    },
};

// Serve Swagger UI at /api/docs
app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, swaggerOptions)
);

// Also serve at /swagger for backward compatibility
app.use(
    "/swagger",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, swaggerOptions)
);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

async function bootstrap() {
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

        // Start auto-deduction scheduler for borrowings
        borrowingService.startAutoDeductionScheduler();

        // Sync last 30 days of prices on startup
        logger.info("Syncing last 30 days of prices...");
        await priceService.syncHistoricalPrices(30);

        logger.info("Initialization complete.");
        logger.info({ defaultSpendingVault }, "Default spending vault");
        logger.info({ defaultIncomeVault }, "Default income vault");
    } catch (e) {
        const msg = (e as { message?: string } | null)?.message ?? String(e);
        logger.error({ error: msg }, "Bootstrap failed");
    }
}

const PORT = config.port;
bootstrap().finally(() => {
    app.listen(PORT, () => {
        logger.info(`Portfolio backend listening on http://localhost:${PORT}`);
        logger.info(`Swagger UI at http://localhost:${PORT}/api/docs`);
        logger.info(`Metrics at http://localhost:${PORT}/metrics`);
    });
});

// Graceful shutdown
process.on("SIGINT", () => {
    logger.info("Shutting down gracefully...");
    closeConnection();
    process.exit(0);
});
