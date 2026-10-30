import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startProgressHeartbeat,
  withProgressHeartbeat,
} from "../../src/utils/progress-heartbeat.js";

describe("startProgressHeartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("says nothing for a step that ends inside the quiet time", () => {
    const logger = { info: vi.fn() };
    const hb = startProgressHeartbeat({ logger, label: "step" });
    vi.advanceTimersByTime(2_000);
    hb.stop();
    vi.advanceTimersByTime(60_000);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("speaks after the quiet time, then every interval, then says how long it took", () => {
    const logger = { info: vi.fn() };
    let done = 0;
    const hb = startProgressHeartbeat({
      logger,
      label: "document-view catch-up",
      progress: () => `${done} of 100 operations`,
    });
    vi.advanceTimersByTime(3_000);
    done = 40;
    vi.advanceTimersByTime(10_000);
    hb.stop("100 operations");

    const lines = logger.info.mock.calls.map((c) => c[0] as string);
    expect(lines).toEqual([
      "document-view catch-up… (3.0 s): 0 of 100 operations",
      "document-view catch-up still running (13.0 s): 40 of 100 operations",
      "document-view catch-up done in 13.0 s: 100 operations",
    ]);
  });

  it("keeps beating when the progress callback throws", () => {
    const logger = { info: vi.fn() };
    const hb = startProgressHeartbeat({
      logger,
      label: "step",
      progress: () => {
        throw new Error("no");
      },
    });
    vi.advanceTimersByTime(3_000);
    hb.stop();
    expect(logger.info.mock.calls[0]![0]).toBe("step… (3.0 s)");
  });

  it("writes minutes for long steps", () => {
    const logger = { info: vi.fn() };
    const hb = startProgressHeartbeat({
      logger,
      label: "step",
      everyMs: 60_000,
    });
    vi.advanceTimersByTime(3_000 + 60_000 * 2);
    hb.stop();
    expect(logger.info.mock.calls.at(-1)![0]).toBe("step done in 2 min 3 s");
  });
});

describe("withProgressHeartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the work's result and marks a slow failure", async () => {
    const logger = { info: vi.fn() };
    await expect(
      withProgressHeartbeat({ logger, label: "fast" }, () =>
        Promise.resolve(7),
      ),
    ).resolves.toBe(7);

    const slow = withProgressHeartbeat({ logger, label: "slow" }, async () => {
      await new Promise((r) => setTimeout(r, 5_000));
      throw new Error("boom");
    });
    const settled = expect(slow).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
    expect(logger.info.mock.calls.map((c) => c[0])).toEqual([
      "slow… (3.0 s)",
      "slow done in 5.0 s: failed",
    ]);
  });
});
