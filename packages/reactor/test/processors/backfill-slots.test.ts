import { describe, expect, it, vi } from "vitest";
import {
  BackfillSlots,
  yieldToEventLoop,
} from "../../src/processors/backfill-slots.js";

describe("BackfillSlots", () => {
  it("hands out slots up to its size, then queues callers in order", async () => {
    const slots = new BackfillSlots(2);
    const first = await slots.acquire();
    await slots.acquire();
    const order: string[] = [];
    const third = slots.acquire().then((release) => {
      order.push("third");
      return release;
    });
    const fourth = slots.acquire().then(() => order.push("fourth"));
    await Promise.resolve();
    expect(order).toEqual([]);

    first();
    (await third)();
    await fourth;

    expect(order).toEqual(["third", "fourth"]);
  });

  it("frees a slot once however often its release is called", async () => {
    const slots = new BackfillSlots(1);
    const release = await slots.acquire();
    release();
    release();
    await slots.acquire();

    let third = false;
    void slots.acquire().then(() => (third = true));
    await Promise.resolve();
    expect(third).toBe(false);
  });

  it("refuses a size that is not a positive integer", () => {
    expect(() => new BackfillSlots(0)).toThrow("positive integer");
    expect(() => new BackfillSlots(1.5)).toThrow("positive integer");
  });
});

describe("yieldToEventLoop", () => {
  it("still yields while a test fakes the timers", async () => {
    vi.useFakeTimers();
    try {
      await yieldToEventLoop();
    } finally {
      vi.useRealTimers();
    }
  });
});
