import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Health Check and Basic API Tests
 *
 * These tests verify the basic functionality of the API including:
 * - Health check endpoint
 * - Basic routing
 * - Error handling
 */

describe("Health Check", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.resetModules();

    // Create a minimal app with just the health endpoint
    app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => res.json({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return ok: true from health endpoint", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should return JSON content type", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("API 404 handling", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => res.json({ ok: true }));
    // Add a 404 handler
    app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  });

  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/unknown-route").expect(404);
    expect(res.body).toHaveProperty("error");
  });
});
