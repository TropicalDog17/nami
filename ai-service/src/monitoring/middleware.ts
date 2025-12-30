import promBundle from 'express-prom-bundle';

export function createMetricsMiddleware() {
  return promBundle({
    includeMethod: true,
    includePath: true,
    includeStatusCode: true,
    promClient: {
      collectDefaultMetrics: {
        prefix: 'nami_ai_http_',
      },
    },
    normalizePath: [
      ['/api/bank-statement/.*', '/api/bank-statement/:file'],
      ['/healthz', '/healthz'],
      ['/ready', '/ready'],
      ['/metrics', '/metrics'],
    ],
  });
}
