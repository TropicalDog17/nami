/**
 * Global type declarations for tests
 */

declare global {
  var testConfig: {
    anthropic: {
      provider: "anthropic";
      apiKey: string;
      baseURL: string;
      timeout: number;
    };
    accounts: Array<{ name: string; id: string }>;
    tags: Array<{ name: string; id: string }>;
  };
}

export {};
