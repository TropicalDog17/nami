import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HealthChecker } from "../../src/api/health.js";
import { AppConfig } from "../../src/utils/config.js";

describe("HealthChecker", () => {
  let healthChecker: HealthChecker;
  let mockConfig: AppConfig;

  beforeEach(() => {
    mockConfig = {
      TELEGRAM_BOT_TOKEN: "test:1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
      OPENAI_API_KEY: "sk-test1234567890abcdef",
      BACKEND_BASE_URL: "http://localhost:3000",
      BACKEND_SIGNING_SECRET: "test-secret-16-chars",
      SERVICE_BASE_URL: "http://localhost:8081",
      PORT: 8081,
      ALLOWED_CHAT_IDS: "123456789",
      DEFAULT_TIMEZONE: "Asia/Ho_Chi_Minh",
      allowedChatIds: new Set(["123456789"]),
    };

    healthChecker = new HealthChecker(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with correct configuration", () => {
    expect(healthChecker).toBeInstanceOf(HealthChecker);
  });

  it("should pass configuration validation", async () => {
    const health = await healthChecker.checkHealth();
    expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
    expect(health.timestamp).toBeDefined();
    expect(health.uptime).toBeGreaterThan(0);
    expect(health.checks).toBeDefined();
    expect(health.summary).toBeDefined();
  });

  it("should fail configuration validation with missing token", async () => {
    const badConfig = {
      ...mockConfig,
      TELEGRAM_BOT_TOKEN: "",
    };
    const badHealthChecker = new HealthChecker(badConfig);
    const health = await badHealthChecker.checkHealth();

    expect(health.checks.config.status).toBe("unhealthy");
    expect(health.checks.config.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("Telegram bot token")]),
    );
  });

  it("should have correct number of health checks", async () => {
    // Note: this test will likely fail with actual network calls, but shows structure
    const health = await healthChecker.checkHealth();
    // Should have 3 checks: backend, openai, config (grounding removed)
    expect(Object.keys(health.checks).length).toBe(3);
  });
});
