/**
 * Swagger UI configuration for Vercel serverless deployment
 *
 * This module exports the Swagger UI HTML and configuration needed to serve
 * API documentation in a serverless environment where local static assets
 * cannot be served.
 */

export interface SwaggerConfig {
  url: string;
  domId: string;
  deepLinking: boolean;
  presets: any[];
  plugins: any[];
  layout: string;
  defaultModelsExpandDepth: number;
  defaultModelExpandDepth: number;
  docExpansion: string;
  filter: boolean;
  showRequestHeaders: boolean;
  tryItOutEnabled: boolean;
}

/**
 * Swagger UI configuration object
 */
export const swaggerConfig: SwaggerConfig = {
  url: "/api/openapi.json",
  domId: "#swagger-ui",
  deepLinking: true,
  presets: [
    "SwaggerUIBundle.presets.apis",
    "SwaggerUIStandalonePreset",
  ],
  plugins: [
    "SwaggerUIBundle.plugins.DownloadUrl",
  ],
  layout: "StandaloneLayout",
  defaultModelsExpandDepth: 1,
  defaultModelExpandDepth: 1,
  docExpansion: "list",
  filter: true,
  showRequestHeaders: true,
  tryItOutEnabled: true,
};

/**
 * Custom CSS for Swagger UI
 */
export const swaggerCustomCSS = `
  html { box-sizing: border-box; overflow-y: scroll; }
  *, *:before, *:after { box-sizing: inherit; }
  body { margin: 0; background: #fafafa; font-family: sans-serif; }
  .swagger-ui .topbar { display: none }
`;

/**
 * Generate Swagger UI HTML with CDN assets
 * This is required for Vercel serverless deployment where static files cannot be served
 *
 * @returns HTML string for Swagger UI
 */
export function getSwaggerHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nami API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    ${swaggerCustomCSS}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "${swaggerConfig.url}",
        dom_id: "${swaggerConfig.domId}",
        deepLinking: ${swaggerConfig.deepLinking},
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "${swaggerConfig.layout}",
        defaultModelsExpandDepth: ${swaggerConfig.defaultModelsExpandDepth},
        defaultModelExpandDepth: ${swaggerConfig.defaultModelExpandDepth},
        docExpansion: "${swaggerConfig.docExpansion}",
        filter: ${swaggerConfig.filter},
        showRequestHeaders: ${swaggerConfig.showRequestHeaders},
        tryItOutEnabled: ${swaggerConfig.tryItOutEnabled}
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
`;
}

/**
 * Pre-generated Swagger HTML for direct import
 */
export const swaggerHtml = getSwaggerHtml();
