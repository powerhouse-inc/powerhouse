import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IQueue } from "../../../../src/queue/interfaces.js";
import {
  IntervalPollTimer,
  calculateBackoffDelay,
} from "../../../../src/sync/channels/interval-poll-timer.js";

function createMockQueue(totalSizeValue = 0): IQueue {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    dequeueNext: vi.fn(),
    size: vi.fn(),
    totalSize: vi.fn().mockResolvedValue(totalSizeValue),
    remove: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    hasJobs: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    retryJob: vi.fn(),
    isDrained: true,
    block: vi.fn(),
    unblock: vi.fn(),
  } as unknown as IQueue;
}

describe("IntervalPollTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should call delegate immediately on start()", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);

    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it("should call delegate repeatedly after intervalMs", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(4);

    timer.stop();
  });

  it("should wait for delegate completion before scheduling next", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    let resolveDelegate: () => void;
    const delegatePromise = new Promise<void>((resolve) => {
      resolveDelegate = resolve;
    });
    const delegate = vi.fn().mockReturnValue(delegatePromise);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(delegate).toHaveBeenCalledTimes(1);

    resolveDelegate!();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();
  });

  it("should stop calling delegate after stop()", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).toHaveBeenCalledTimes(2);
  });

  it("should clear pending timer on stop()", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    timer.stop();

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it("should not call delegate if not running", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).not.toHaveBeenCalled();
  });

  it("should retry with backoff after delegate throws error", async () => {
    const mockQueue = createMockQueue();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const timer = new IntervalPollTimer(mockQueue, {
      intervalMs: 1000,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 300000,
    });
    const delegate = vi.fn().mockRejectedValue(new Error("Test error"));

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    // First failure: backoff = min(300000, 1000*2^0) = 1000, delay = 500 + 0.5*500 = 750
    await vi.advanceTimersByTimeAsync(750);
    expect(delegate).toHaveBeenCalledTimes(2);

    // Second failure: backoff = min(300000, 1000*2^1) = 2000, delay = 1000 + 0.5*1000 = 1500
    await vi.advanceTimersByTimeAsync(1500);
    expect(delegate).toHaveBeenCalledTimes(3);

    timer.stop();
  });

  it("should allow restart after stop", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();

    await vi.advanceTimersByTimeAsync(2000);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(3);

    timer.stop();
  });

  it("should not schedule next tick if stopped during delegate execution", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    let resolveDelegate: () => void;
    const delegatePromise = new Promise<void>((resolve) => {
      resolveDelegate = resolve;
    });
    const delegate = vi.fn().mockReturnValue(delegatePromise);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();

    resolveDelegate!();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it("should report isRunning() correctly", () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);
    timer.setDelegate(delegate);

    expect(timer.isRunning()).toBe(false);

    timer.start();
    expect(timer.isRunning()).toBe(true);

    timer.stop();
    expect(timer.isRunning()).toBe(false);
  });

  it("should report isPaused() correctly", () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);
    timer.setDelegate(delegate);

    expect(timer.isPaused()).toBe(false);

    timer.start();
    expect(timer.isPaused()).toBe(false);

    timer.pause();
    expect(timer.isPaused()).toBe(true);

    timer.resume();
    expect(timer.isPaused()).toBe(false);

    timer.stop();
  });

  it("should stop scheduling when paused", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.pause();

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();
  });

  it("should resume scheduling after pause", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.pause();

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.resume();

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(3);

    timer.stop();
  });

  it("should trigger immediate poll with triggerNow()", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.triggerNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();
  });

  it("should trigger poll when paused via triggerNow()", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.pause();

    timer.triggerNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();
  });

  it("should not trigger poll when not running", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);

    timer.triggerNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(0);
  });

  it("should clear timer when paused", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);

    timer.pause();

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it("should not resume if not running", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);

    timer.pause();
    timer.resume();

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).toHaveBeenCalledTimes(0);
  });

  describe("calculateBackoffDelay", () => {
    it("should compute correct delay for first failure", () => {
      // backoff = min(300000, 1000*2^0) = 1000, delay = 500 + 0.5*500 = 750
      expect(calculateBackoffDelay(1, 1000, 300000, 0.5)).toBe(750);
    });

    it("should compute correct delay for second failure", () => {
      // backoff = min(300000, 1000*2^1) = 2000, delay = 1000 + 0.5*1000 = 1500
      expect(calculateBackoffDelay(2, 1000, 300000, 0.5)).toBe(1500);
    });

    it("should cap at retryMaxDelayMs", () => {
      // backoff = min(5000, 1000*2^19) = 5000, delay = 2500 + 0.5*2500 = 3750
      expect(calculateBackoffDelay(20, 1000, 5000, 0.5)).toBe(3750);
    });

    it("should return half the backoff when random is 0", () => {
      // backoff = 1000, delay = 500 + 0*500 = 500
      expect(calculateBackoffDelay(1, 1000, 300000, 0)).toBe(500);
    });

    it("should return the full backoff when random is 1", () => {
      // backoff = 1000, delay = 500 + 1*500 = 1000
      expect(calculateBackoffDelay(1, 1000, 300000, 1)).toBe(1000);
    });
  });

  describe("timer backoff integration", () => {
    it("should retry after delegate rejection", async () => {
      const mockQueue = createMockQueue();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 300000,
      });
      const delegate = vi.fn().mockRejectedValue(new Error("fail"));

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      // Should retry after backoff delay (750ms for first failure)
      await vi.advanceTimersByTimeAsync(750);
      expect(delegate).toHaveBeenCalledTimes(2);

      expect(timer.isRunning()).toBe(true);
      timer.stop();
    });

    it("should reset to base intervalMs after success", async () => {
      const mockQueue = createMockQueue();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 300000,
      });

      let callCount = 0;
      const delegate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error("fail"));
        }
        return Promise.resolve();
      });

      timer.setDelegate(delegate);
      timer.start();

      // First call fails
      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      // Second call at backoff 750ms, also fails
      await vi.advanceTimersByTimeAsync(750);
      expect(delegate).toHaveBeenCalledTimes(2);

      // Third call at backoff 1500ms, succeeds
      await vi.advanceTimersByTimeAsync(1500);
      expect(delegate).toHaveBeenCalledTimes(3);

      // Next call should be at normal interval (1000ms), not backoff
      await vi.advanceTimersByTimeAsync(1000);
      expect(delegate).toHaveBeenCalledTimes(4);

      timer.stop();
    });

    it("should reset backoff state on start()", async () => {
      const mockQueue = createMockQueue();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 300000,
      });
      const delegate = vi.fn().mockRejectedValue(new Error("fail"));

      timer.setDelegate(delegate);
      timer.start();

      // Build up some failures
      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(750);
      expect(delegate).toHaveBeenCalledTimes(2);

      timer.stop();

      // Restart should reset backoff - first retry should be at 750ms again
      delegate.mockClear();
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      // First failure after restart: delay = 750ms (not escalated)
      await vi.advanceTimersByTimeAsync(750);
      expect(delegate).toHaveBeenCalledTimes(2);

      timer.stop();
    });
  });

  describe("getIntervalMs / setIntervalMs", () => {
    it("should return the configured intervalMs", () => {
      const mockQueue = createMockQueue();
      const timer = new IntervalPollTimer(mockQueue, { intervalMs: 5000 });

      expect(timer.getIntervalMs()).toBe(5000);
    });

    it("should return the default intervalMs when not specified", () => {
      const mockQueue = createMockQueue();
      const timer = new IntervalPollTimer(mockQueue);

      expect(timer.getIntervalMs()).toBe(2000);
    });

    it("should update the interval used by subsequent ticks", async () => {
      const mockQueue = createMockQueue();
      const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      timer.setIntervalMs(3000);
      expect(timer.getIntervalMs()).toBe(3000);

      // Old interval (1000ms) should not trigger a tick
      await vi.advanceTimersByTimeAsync(1000);
      expect(delegate).toHaveBeenCalledTimes(2);

      // New interval should be used for the next schedule
      await vi.advanceTimersByTimeAsync(3000);
      expect(delegate).toHaveBeenCalledTimes(3);

      timer.stop();
    });

    it("should not affect the currently pending timer", async () => {
      const mockQueue = createMockQueue();
      const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      // First tick fires immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      // 500ms into the 1000ms wait, change interval to 5000ms
      await vi.advanceTimersByTimeAsync(500);
      timer.setIntervalMs(5000);

      // The already-scheduled timer at 1000ms still fires
      await vi.advanceTimersByTimeAsync(500);
      expect(delegate).toHaveBeenCalledTimes(2);

      // Now the new 5000ms interval is used
      await vi.advanceTimersByTimeAsync(4999);
      expect(delegate).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      expect(delegate).toHaveBeenCalledTimes(3);

      timer.stop();
    });
  });

  describe("backpressure", () => {
    it("should skip delegate when queue exceeds maxQueueDepth", async () => {
      const mockQueue = createMockQueue(200);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        maxQueueDepth: 100,
        backpressureCheckIntervalMs: 500,
      });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).not.toHaveBeenCalled();

      timer.stop();
    });

    it("should recheck at backpressureCheckIntervalMs when saturated", async () => {
      const mockQueue = createMockQueue(200);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        maxQueueDepth: 100,
        backpressureCheckIntervalMs: 500,
      });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).not.toHaveBeenCalled();
      expect(mockQueue.totalSize).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(delegate).not.toHaveBeenCalled();
      expect(mockQueue.totalSize).toHaveBeenCalledTimes(2);

      timer.stop();
    });

    it("should resume delegate calls when queue drains below threshold", async () => {
      const mockQueue = createMockQueue(200);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        maxQueueDepth: 100,
        backpressureCheckIntervalMs: 500,
      });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).not.toHaveBeenCalled();

      vi.mocked(mockQueue.totalSize).mockResolvedValue(50);

      await vi.advanceTimersByTimeAsync(500);
      expect(delegate).toHaveBeenCalledTimes(1);

      timer.stop();
    });

    it("should call delegate when queue is exactly at threshold", async () => {
      const mockQueue = createMockQueue(100);
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        maxQueueDepth: 100,
        backpressureCheckIntervalMs: 500,
      });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).toHaveBeenCalledTimes(1);

      timer.stop();
    });

    it("should fail-open and schedule next at normal interval when totalSize() throws", async () => {
      const mockQueue = createMockQueue();
      vi.mocked(mockQueue.totalSize).mockRejectedValue(
        new Error("queue error"),
      );
      const timer = new IntervalPollTimer(mockQueue, {
        intervalMs: 1000,
        maxQueueDepth: 100,
        backpressureCheckIntervalMs: 500,
      });
      const delegate = vi.fn().mockResolvedValue(undefined);

      timer.setDelegate(delegate);
      timer.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(delegate).not.toHaveBeenCalled();

      vi.mocked(mockQueue.totalSize).mockResolvedValue(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(delegate).toHaveBeenCalledTimes(1);

      timer.stop();
    });
  });
});
