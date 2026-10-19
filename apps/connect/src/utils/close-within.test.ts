import { describe, expect, it, vi } from "vitest";
import { closeWithin } from "./close-within.js";

describe("closeWithin", () => {
  it("gives up on a close that never settles", async () => {
    vi.useFakeTimers();
    try {
      const closing = closeWithin(
        { close: () => new Promise<void>(() => undefined) },
        1_000,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await closing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a close that fails", async () => {
    await expect(
      closeWithin({ close: () => Promise.reject(new Error("aborted")) }, 1_000),
    ).resolves.toBe(false);
  });

  it("reports a store that closed", async () => {
    await expect(closeWithin({ close: () => Promise.resolve() })).resolves.toBe(
      true,
    );
    await expect(closeWithin(undefined)).resolves.toBe(true);
  });
});
