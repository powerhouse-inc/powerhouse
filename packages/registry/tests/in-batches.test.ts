import { describe, expect, it } from "vitest";
import { inBatches } from "../src/processor.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("inBatches", () => {
  it("runs every item, a few at a time", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await inBatches([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++running);
      await tick();
      done.push(n);
      running--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("rejects only once every running item settles, starting no more", async () => {
    const started: number[] = [];
    let settled = 0;
    const run = inBatches([1, 2, 3, 4, 5, 6], 3, async (n) => {
      started.push(n);
      if (n === 1) throw new Error("upload failed");
      await tick();
      settled++;
    });
    await expect(run).rejects.toThrow("upload failed");
    // The two lanes still uploading finished before the caller saw the error
    expect(settled).toBe(2);
    expect(started).toEqual([1, 2, 3]);
  });
});
