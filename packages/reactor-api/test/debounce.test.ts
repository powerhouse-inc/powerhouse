import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/packages/util.js";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track<T>(promise: Promise<T>) {
    const state = {
      resolved: [] as T[],
      rejected: [] as unknown[],
    };
    promise.then(
      (value) => {
        state.resolved.push(value);
      },
      (error: unknown) => {
        state.rejected.push(error);
      },
    );
    return state;
  }

  it("settles a superseded call with the run that follows", async () => {
    let calls = 0;
    const func = vi.fn(() => Promise.resolve(++calls));
    const debounced = debounce(func, 1000);

    const first = track(debounced());
    const second = debounced();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(second).resolves.toBe(1);
    expect(first.resolved).toEqual([1]);
    expect(func).toHaveBeenCalledOnce();
  });

  it("rejects every waiting caller exactly once", async () => {
    const failure = new Error("update failed");
    const func = vi.fn(() => Promise.reject(failure));
    const debounced = debounce(func, 1000);

    const callers = [
      track(debounced()),
      track(debounced()),
      track(debounced()),
    ];
    await vi.advanceTimersByTimeAsync(5000);

    for (const caller of callers) {
      expect(caller.rejected).toEqual([failure]);
      expect(caller.resolved).toEqual([]);
    }
    expect(func).toHaveBeenCalledOnce();
  });

  it("rejects the waiting callers when the function throws synchronously", async () => {
    const failure = new Error("sync failure");
    const debounced = debounce(() => {
      throw failure;
    }, 1000);

    const caller = track(debounced());
    await vi.advanceTimersByTimeAsync(1000);

    expect(caller.rejected).toEqual([failure]);
  });

  it("settles a pending call with an immediate call that supersedes it", async () => {
    let calls = 0;
    const func = vi.fn(() => Promise.resolve(++calls));
    const debounced = debounce(func, 1000);

    const pending = track(debounced());
    await expect(debounced(true)).resolves.toBe(1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(pending.resolved).toEqual([1]);
    expect(func).toHaveBeenCalledOnce();
  });

  it("starts a fresh run for a call made while one is in flight", async () => {
    let calls = 0;
    const func = vi.fn(() => Promise.resolve(++calls));
    const debounced = debounce(func, 1000);

    const immediate = debounced(true);
    const later = debounced();

    await expect(immediate).resolves.toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(later).resolves.toBe(2);
    expect(func).toHaveBeenCalledTimes(2);
  });
});
