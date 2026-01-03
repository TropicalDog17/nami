import promBundle from "express-prom-bundle";

export function createMetricsMiddleware() {
  return promBundle({
    includeMethod: true,
    includePath: true,
    includeStatusCode: true,
    promClient: {
      collectDefaultMetrics: {
        prefix: "nami_backend_http_",
      },
    },
    normalizePath: [
      ["/api/transactions/.*", "/api/transactions/:id"],
      ["/api/vaults/.*", "/api/vaults/:name"],
      ["/api/reports/.*", "/api/reports/:type"],
    ],
  });
}
