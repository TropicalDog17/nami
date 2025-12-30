import express from 'express';
import promClient from 'prom-client';
import { createMetricsMiddleware } from './middleware.js';
import { createCustomMetrics, ServiceMetrics } from './metrics.js';

export function setupMonitoring(app: express.Application) {
  const register = promClient.register;

  // Default labels for all metrics
  register.setDefaultLabels({
    service: 'nami-ai-service',
    environment: process.env.NODE_ENV || 'development',
  });

  // Collect default Node.js metrics
  promClient.collectDefaultMetrics({
    prefix: 'nami_ai_',
    register,
  });

  // Create custom metrics
  const metrics = createCustomMetrics(register);

  // Create Express middleware for HTTP metrics
  const metricsMiddleware = createMetricsMiddleware();

  // Register metrics endpoint
  const registerMetricsEndpoint = () => {
    app.get('/metrics', async (_req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.status(500).end((err as Error).message);
      }
    });
  };

  return {
    metricsMiddleware,
    registerMetricsEndpoint,
    metrics,
    register,
  };
}

// Export a getter for metrics that can be used in handlers
let globalMetrics: ServiceMetrics | null = null;

export function setMetrics(metrics: ServiceMetrics) {
  globalMetrics = metrics;
}

export function getMetrics(): ServiceMetrics {
  if (!globalMetrics) {
    throw new Error('Metrics not initialized. Call setupMonitoring first.');
  }
  return globalMetrics;
}
