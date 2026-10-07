import { describe, expect, it, vi } from "vitest";
import { closeWithin } from "./close-within.js";

describe("closeWithin", () => {
  it("gives up on a close that never settles", async () => {
    vi.useFakeTimers();
    try {
      let settled = false;
      const closing = closeWithin(
        { close: () => new Promise<void>(() => undefined) },
        1_000,
      ).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await closing;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a close that fails", async () => {
    await expect(
      closeWithin({ close: () => Promise.reject(new Error("aborted")) }, 1_000),
    ).resolves.toBeUndefined();
  });
});
