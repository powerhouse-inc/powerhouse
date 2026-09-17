import { describe, expect, it } from "vitest";
import { Semaphore } from "../src/lib/semaphore.js";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("Semaphore", () => {
  it("rejects a non-positive limit", () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });

  it("caps in-flight work at the limit and runs the rest in order", async () => {
    const sem = new Semaphore(2);
    const order: string[] = [];
    let peak = 0;
    const gates: (() => void)[] = [];
    const job = (name: string) =>
      sem.with(async () => {
        order.push(`start ${name}`);
        peak = Math.max(peak, sem.inFlight);
        await new Promise<void>((r) => gates.push(r));
        order.push(`end ${name}`);
        return name;
      });

    const all = Promise.all([job("a"), job("b"), job("c")]);
    await tick();
    expect(sem.inFlight).toBe(2);
    expect(order).toEqual(["start a", "start b"]);

    gates.shift()?.();
    await tick();
    expect(order).toEqual(["start a", "start b", "end a", "start c"]);
    expect(sem.inFlight).toBe(2);

    gates.shift()?.();
    gates.shift()?.();
    expect(await all).toEqual(["a", "b", "c"]);
    expect(sem.inFlight).toBe(0);
    expect(peak).toBe(2);
  });

  it("releases on throw and a release is idempotent", async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.with(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(sem.inFlight).toBe(0);

    const release = await sem.acquire();
    expect(sem.inFlight).toBe(1);
    release();
    release();
    expect(sem.inFlight).toBe(0);
  });
});
