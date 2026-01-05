import express from "express";
import { loadConfig } from "../src/utils/config.js";
import { logger } from "../src/utils/logger.js";
import { HealthChecker } from "../src/api/health.js";
import { apiTestRouter } from "../src/api/api-test.js";
import { setupMonitoring, setMetrics } from "../src/monitoring/index.js";

const app = express();

// Load config
let cfg: ReturnType<typeof loadConfig>;
let healthChecker: HealthChecker;

try {
  cfg = loadConfig();
  healthChecker = new HealthChecker(cfg);
} catch (error) {
  logger.error(
    { error },
    "Failed to load config - some endpoints may not work",
  );
}

// Setup monitoring
const { metricsMiddleware, registerMetricsEndpoint, metrics } =
  setupMonitoring(app);
app.use(metricsMiddleware);
setMetrics(metrics);

app.use(express.json({ limit: "2mb" }));

// Comprehensive health check endpoint
app.get("/healthz", async (req, res) => {
  try {
    if (!healthChecker) {
      return res.status(503).json({
        status: "unhealthy",
        error: "Config not loaded",
        timestamp: new Date().toISOString(),
      });
    }
    const health = await healthChecker.checkHealth();
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error({ err: error }, "Health check failed");
    res.status(500).json({
      status: "unhealthy",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Simple readiness probe
app.get("/ready", (req, res) => {
  res.json({ ready: true, timestamp: new Date().toISOString() });
});

// Prometheus metrics endpoint
registerMetricsEndpoint();

// API testing endpoints
app.use("/api/test", apiTestRouter);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "nami-ai-service",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Export the Express app
export default app;
