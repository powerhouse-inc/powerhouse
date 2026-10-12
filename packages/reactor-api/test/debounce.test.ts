import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/packages/util.js";

// Pins existing behaviour: a caller that must run awaits with immediate=true.
describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track<T>(promise: Promise<T>) {
    const state = { settled: false };
    promise.then(
      () => {
        state.settled = true;
      },
      () => {
        state.settled = true;
      },
    );
    return state;
  }

  it("never settles a superseded call's promise", async () => {
    const func = vi.fn((value: string) => Promise.resolve(value));
    const debounced = debounce(func, 1000);

    const first = track(debounced(false, "first"));
    const second = debounced(false, "second");
    await vi.advanceTimersByTimeAsync(1000);

    await expect(second).resolves.toBe("second");
    await vi.advanceTimersByTimeAsync(5000);
    expect(first.settled).toBe(false);
    expect(func).toHaveBeenCalledOnce();
    expect(func).toHaveBeenCalledWith("second");
  });

  it("settles an immediate call even when a later call follows", async () => {
    const func = vi.fn((value: string) => Promise.resolve(value));
    const debounced = debounce(func, 1000);

    const immediate = debounced(true, "immediate");
    const later = debounced(false, "later");

    await expect(immediate).resolves.toBe("immediate");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(later).resolves.toBe("later");
    expect(func).toHaveBeenCalledTimes(2);
  });
});
