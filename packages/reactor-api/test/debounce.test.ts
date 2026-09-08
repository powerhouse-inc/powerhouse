import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/packages/util.js";

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("settles every coalesced caller with the latest invocation result", async () => {
    vi.useFakeTimers();
    const callback = vi.fn((value: number) => Promise.resolve(value * 2));
    const debounced = debounce(callback, 100);

    const first = debounced(false, 1);
    const second = debounced(false, 3);
    await vi.advanceTimersByTimeAsync(100);

    await expect(first).resolves.toBe(6);
    await expect(second).resolves.toBe(6);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(3);
  });

  it("settles pending callers when the latest invocation is immediate", async () => {
    vi.useFakeTimers();
    const callback = vi.fn((value: number) => Promise.resolve(value));
    const debounced = debounce(callback, 100);

    const pending = debounced(false, 1);
    const immediate = debounced(true, 2);

    await expect(pending).resolves.toBe(2);
    await expect(immediate).resolves.toBe(2);
    expect(callback).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects every coalesced caller when the callback fails", async () => {
    vi.useFakeTimers();
    const error = new Error("failed");
    const debounced = debounce((_value: number) => Promise.reject(error), 100);

    const first = debounced(false, 1);
    const second = debounced(false, 2);
    const firstRejection = expect(first).rejects.toBe(error);
    const secondRejection = expect(second).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([firstRejection, secondRejection]);
  });
});
