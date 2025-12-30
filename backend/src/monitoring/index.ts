import express from "express";
import promClient from "prom-client";
import { createMetricsMiddleware } from "./middleware";
import { registerDatabaseMetrics } from "./database-collector";
import { createCustomMetrics, CustomMetrics } from "./metrics";

export function setupMonitoring(app: express.Application) {
  const register = promClient.register;

  // Default labels for all metrics
  register.setDefaultLabels({
    service: "nami-backend",
    environment: process.env.NODE_ENV || "development",
  });

  // Collect default Node.js metrics
  promClient.collectDefaultMetrics({
    prefix: "nami_backend_",
    register,
  });

  // Create custom metrics
  const customMetrics = createCustomMetrics(register);

  // Register database metrics collector
  registerDatabaseMetrics(register, customMetrics);

  // Create Express middleware for HTTP metrics
  const metricsMiddleware = createMetricsMiddleware();

  // Register metrics endpoint
  const registerMetricsEndpoint = () => {
    app.get("/metrics", async (_req, res) => {
      try {
        res.set("Content-Type", register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.status(500).end((err as Error).message);
      }
    });
  };

  return {
    metricsMiddleware,
    registerMetricsEndpoint,
    metrics: customMetrics,
    register,
  };
}

// Export a getter for metrics that can be used in handlers
let globalMetrics: CustomMetrics | null = null;

export function setMetrics(metrics: CustomMetrics) {
  globalMetrics = metrics;
}

export function getMetrics(): CustomMetrics {
  if (!globalMetrics) {
    throw new Error("Metrics not initialized. Call setupMonitoring first.");
  }
  return globalMetrics;
}
