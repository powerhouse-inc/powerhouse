import { describe, expect, it } from "vitest";
import { runTimeline } from "./run-format.js";

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();

describe("runTimeline", () => {
  it("places each timed step on the run's length", () => {
    const spans = runTimeline({
      startedAt: at(0),
      endedAt: at(100),
      steps: [
        { stepId: "a", startedAt: at(0), endedAt: at(25) },
        { stepId: "b", startedAt: at(25), endedAt: at(100) },
        { stepId: "c", startedAt: null, endedAt: null },
      ],
    });
    expect(spans.get("a")).toEqual({ offset: 0, width: 0.25, ms: 25 });
    expect(spans.get("b")).toEqual({ offset: 0.25, width: 0.75, ms: 75 });
    expect(spans.has("c")).toBe(false);
  });

  it("stretches the axis to a step that outlasts the recorded end", () => {
    const spans = runTimeline({
      startedAt: at(0),
      endedAt: null,
      steps: [{ stepId: "a", startedAt: at(50), endedAt: at(200) }],
    });
    expect(spans.get("a")).toEqual({ offset: 0.25, width: 0.75, ms: 150 });
  });

  it("returns no spans when the run has no length", () => {
    const spans = runTimeline({
      startedAt: at(100),
      endedAt: at(100),
      steps: [{ stepId: "a", startedAt: at(100), endedAt: at(100) }],
    });
    expect(spans.size).toBe(0);
    expect(
      runTimeline({ startedAt: at(100), endedAt: null, steps: [] }).size,
    ).toBe(0);
  });

  it("clamps a step that starts before the run to offset 0", () => {
    const spans = runTimeline({
      startedAt: at(100),
      endedAt: at(200),
      steps: [{ stepId: "a", startedAt: at(50), endedAt: at(150) }],
    });
    expect(spans.get("a")).toEqual({ offset: 0, width: 1, ms: 100 });
  });
});
