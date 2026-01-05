import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
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

// Custom Swagger UI HTML that loads assets from CDN (required for Vercel serverless with SSO)
const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nami API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; font-family: sans-serif; }
    .swagger-ui .topbar { display: none }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list",
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
`;

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

// Vercel serverless handler
export default function handler(req: VercelRequest, res: VercelResponse) {
    ensureInitialized();
    return app(req as any, res as any);
}
