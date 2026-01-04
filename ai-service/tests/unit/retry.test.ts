import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../src/utils/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should succeed on first attempt", async () => {
    const mockOperation = vi.fn().mockResolvedValue("success");

    const result = await withRetry(mockOperation, "testOperation");

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result).toBe("success");
  });

  it("should retry on retryable error", async () => {
    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(mockOperation, "testOperation", {
      maxAttempts: 3,
      baseDelayMs: 100,
    });

    // First call fails
    await vi.advanceTimersByTimeAsync(0);

    // Wait for retry
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(result).toBe("success");
  });

  it("should not retry on non-retryable error", async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error("Invalid token"));

    await expect(
      withRetry(mockOperation, "testOperation", {
        maxAttempts: 3,
        baseDelayMs: 100,
      }),
    ).rejects.toThrow("Invalid token");

    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it("should use exponential backoff", async () => {
    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(mockOperation, "testOperation", {
      maxAttempts: 3,
      baseDelayMs: 100,
      backoffFactor: 2,
    });

    // First attempt fails
    await vi.advanceTimersByTimeAsync(0);

    // Second attempt fails after 100ms delay
    await vi.advanceTimersByTimeAsync(100);

    // Third attempt succeeds after 200ms delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(mockOperation).toHaveBeenCalledTimes(3);
    expect(result).toBe("success");
  });

  it("should fail after max attempts", async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    // Start the retry operation
    const promise = withRetry(mockOperation, "testOperation", {
      maxAttempts: 2,
      baseDelayMs: 100,
    });

    // Advance timers to trigger retries
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();

    // Expect the operation to have failed
    await expect(promise).rejects.toThrow("ECONNRESET");
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });

  it("should handle rate limit errors as retryable", async () => {
    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit exceeded"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(mockOperation, "testOperation", {
      maxAttempts: 2,
      baseDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(result).toBe("success");
  });

  it("should handle HTTP 503 errors as retryable", async () => {
    const mockOperation = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(mockOperation, "testOperation", {
      maxAttempts: 2,
      baseDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(result).toBe("success");
  });
});
