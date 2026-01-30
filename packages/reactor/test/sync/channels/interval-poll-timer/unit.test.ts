import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntervalPollTimer } from "../../../../src/sync/channels/interval-poll-timer.js";

describe("IntervalPollTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should call delegate immediately on start()", () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it("should call delegate repeatedly after intervalMs", async () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

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
    const timer = new IntervalPollTimer(1000);
    let resolveDelegate: () => void;
    const delegatePromise = new Promise<void>((resolve) => {
      resolveDelegate = resolve;
    });
    const delegate = vi.fn().mockReturnValue(delegatePromise);

    timer.setDelegate(delegate);
    timer.start();

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
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(2);

    timer.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).toHaveBeenCalledTimes(2);
  });

  it("should clear pending timer on stop()", async () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    timer.stop();

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it("should not call delegate if not running", async () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);

    await vi.advanceTimersByTimeAsync(5000);
    expect(delegate).not.toHaveBeenCalled();
  });

  it("should handle delegate that throws error", async () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockRejectedValue(new Error("Test error"));

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it("should allow restart after stop", async () => {
    const timer = new IntervalPollTimer(1000);
    const delegate = vi.fn().mockResolvedValue(undefined);

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();

    await vi.advanceTimersByTimeAsync(2000);
    expect(delegate).toHaveBeenCalledTimes(1);

    timer.start();
    expect(delegate).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(delegate).toHaveBeenCalledTimes(3);

    timer.stop();
  });

  it("should not schedule next tick if stopped during delegate execution", async () => {
    const timer = new IntervalPollTimer(1000);
    let resolveDelegate: () => void;
    const delegatePromise = new Promise<void>((resolve) => {
      resolveDelegate = resolve;
    });
    const delegate = vi.fn().mockReturnValue(delegatePromise);

    timer.setDelegate(delegate);
    timer.start();

    expect(delegate).toHaveBeenCalledTimes(1);

    timer.stop();

    resolveDelegate!();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(delegate).toHaveBeenCalledTimes(1);
  });
});
