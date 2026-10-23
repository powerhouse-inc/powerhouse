import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  BackfillSlots,
  pauseFor,
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

  it("refuses a size that is not a non-negative integer", () => {
    expect(() => new BackfillSlots(-1)).toThrow("non-negative integer");
    expect(() => new BackfillSlots(1.5)).toThrow("non-negative integer");
    expect(() => new BackfillSlots(2).resize(-1)).toThrow(
      "non-negative integer",
    );
  });

  it("hands nothing out at size 0 until it is raised", async () => {
    const slots = new BackfillSlots(0);
    let acquired = false;
    const waiting = slots.acquire().then((release) => {
      acquired = true;
      return release;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    slots.resize(1);
    (await waiting)();
    expect(acquired).toBe(true);
  });

  it("starts every waiter a raise makes room for, in order", async () => {
    const slots = new BackfillSlots(1);
    await slots.acquire();
    const order: number[] = [];
    const waiters = [1, 2, 3].map((n) =>
      slots.acquire().then(() => order.push(n)),
    );

    slots.resize(3);
    await Promise.all(waiters.slice(0, 2));
    await Promise.resolve();

    expect(order).toEqual([1, 2]);
    expect(slots.inUse).toBe(3);
    expect(slots.waiters).toBe(1);
  });

  it("lets holders keep their slots when lowered, and makes new acquires wait", async () => {
    const slots = new BackfillSlots(3);
    const first = await slots.acquire();
    const second = await slots.acquire();
    slots.resize(1);
    expect(slots.inUse).toBe(2);

    let third = false;
    void slots.acquire().then(() => (third = true));
    first();
    await Promise.resolve();
    expect(third).toBe(false);

    second();
    await vi.waitFor(() => expect(third).toBe(true));
    expect(slots.inUse).toBe(1);
  });

  it("ends a wait without a slot once cancelled", async () => {
    const slots = new BackfillSlots(0);
    const controller = new AbortController();
    const waiting = slots.acquire(controller.signal);
    controller.abort();
    (await waiting)();

    expect(slots.waiters).toBe(0);
    expect(slots.inUse).toBe(0);
    (await slots.acquire(controller.signal))();
    expect(slots.waiters).toBe(0);
  });

  it("stops listening for a cancel once a wait gets its slot", async () => {
    const slots = new BackfillSlots(1);
    const { signal } = new AbortController();
    for (let i = 0; i < 5; i++) {
      const holder = await slots.acquire(signal);
      const waiting = slots.acquire(signal);
      expect(getEventListeners(signal, "abort")).toHaveLength(1);
      holder();
      (await waiting)();
    }
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
  });
});

describe("pauseFor", () => {
  it("ends early once cancelled, and stops listening once it ends", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = pauseFor(10_000, controller.signal);
    controller.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1_000);

    const { signal } = new AbortController();
    await pauseFor(1, signal);
    await pauseFor(1, signal);
    expect(getEventListeners(signal, "abort")).toHaveLength(0);
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
