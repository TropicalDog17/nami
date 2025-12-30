/**
 * Centralized configuration management
 * Provides type-safe access to all environment variables with validation
 */

interface Config {
  // Server
  port: number;
  nodeEnv: string;

  // Storage
  storageBackend: 'database' | 'json';

  // AI/Security
  backendSigningSecret?: string;

  // Feature flags
  noExternalRates: boolean;
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined && fallback === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ?? fallback!;
}

/**
 * Parse boolean from environment variable
 */
function getBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Parse number from environment variable
 */
function getNumber(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return num;
}

/**
 * Validate and load configuration
 */
function loadConfig(): Config {
  return {
    port: getNumber('PORT', 8080),
    nodeEnv: getEnv('NODE_ENV', 'development'),
    storageBackend: (getEnv('STORAGE_BACKEND', 'json') === 'database' ? 'database' : 'json'),
    backendSigningSecret: process.env.BACKEND_SIGNING_SECRET,
    noExternalRates: getBool('NO_EXTERNAL_RATES', false),
  };
}

// Singleton instance
let configInstance: Config | null = null;

/**
 * Get configuration singleton
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

// Export convenience getters
export const config = {
  get port(): number { return getConfig().port; },
  get nodeEnv(): string { return getConfig().nodeEnv; },
  get storageBackend(): 'database' | 'json' { return getConfig().storageBackend; },
  get backendSigningSecret(): string | undefined { return getConfig().backendSigningSecret; },
  get noExternalRates(): boolean { return getConfig().noExternalRates; },
  get isDevelopment(): boolean { return getConfig().nodeEnv !== 'production'; },
  get isProduction(): boolean { return getConfig().nodeEnv === 'production'; },
};
