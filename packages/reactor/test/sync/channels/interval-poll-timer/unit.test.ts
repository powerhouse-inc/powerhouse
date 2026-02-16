import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IQueue } from "../../../../src/queue/interfaces.js";
import { IntervalPollTimer } from "../../../../src/sync/channels/interval-poll-timer.js";

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

  it("should handle delegate that throws error", async () => {
    const mockQueue = createMockQueue();
    const timer = new IntervalPollTimer(mockQueue, { intervalMs: 1000 });
    const delegate = vi.fn().mockRejectedValue(new Error("Test error"));

    timer.setDelegate(delegate);
    timer.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(1);

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
