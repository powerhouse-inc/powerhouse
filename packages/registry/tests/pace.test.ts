import { describe, expect, it } from "vitest";
import { pacer } from "../src/pace.js";

describe("pacer", () => {
  it("spaces calls to the rate, in the order they ask", async () => {
    const pace = pacer(100);
    const start = Date.now();
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) => pace().then(() => order.push(i))),
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
    // Five calls at 10 ms apart: the last waits about 40 ms
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });

  it("lets a call through at once after a quiet spell", async () => {
    const pace = pacer(10);
    await pace();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const start = Date.now();
    await pace();
    expect(Date.now() - start).toBeLessThan(20);
  });
});
