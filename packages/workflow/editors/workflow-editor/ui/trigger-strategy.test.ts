// Which piece trigger strategies the picker offers. This has to track what the
// runtime actually serves, or the editor arms a trigger that never fires.
import { describe, expect, it } from "vitest";
import { triggerStrategyRuns } from "./piece-source.js";

describe("triggerStrategyRuns", () => {
  it("offers polling and webhook triggers", () => {
    // WEBHOOK was gated with APP_WEBHOOK before the reactor could serve a
    // package's endpoints; it runs now, so gating it hid working pieces.
    expect(triggerStrategyRuns("POLLING")).toBe(true);
    expect(triggerStrategyRuns("WEBHOOK")).toBe(true);
  });

  it("refuses APP_WEBHOOK, which the runtime maps to polling", () => {
    // An app-webhook trigger's run hook needs a request, so polling calls it
    // blind: offering it would arm a trigger that never fires.
    expect(triggerStrategyRuns("APP_WEBHOOK")).toBe(false);
  });

  it("treats a missing strategy as polling, as the catalog does", () => {
    expect(triggerStrategyRuns(null)).toBe(true);
    expect(triggerStrategyRuns(undefined)).toBe(true);
  });
});
