import { describe, expect, it } from "vitest";
import { startRequestTimings, timed, withRequestTimings } from "./timings.js";

describe("request timings", () => {
  it("records the phase a nested one ran inside", async () => {
    const timings = startRequestTimings();
    await withRequestTimings(timings, () =>
      timed("action", () => timed("models", () => Promise.resolve())),
    );

    expect(
      timings.phases.map(({ name, parent }) => ({ name, parent })),
    ).toEqual([
      { name: "models", parent: "action" },
      { name: "action", parent: undefined },
    ]);
  });

  it("records nothing outside a request", async () => {
    const timings = startRequestTimings();
    await timed("action", () => Promise.resolve());

    expect(timings.phases).toEqual([]);
  });
});
