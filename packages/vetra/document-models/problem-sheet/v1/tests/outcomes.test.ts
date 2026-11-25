import {
  addOutcome,
  clearOutcomeMetric,
  clearOutcomeRole,
  clearOutcomeStep,
  reducer,
  removeOutcome,
  reorderOutcomes,
  updateOutcome,
  utils,
} from "document-models/problem-sheet/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Outcome operations", () => {
  it("adds an outcome with optional refs defaulting to null", () => {
    const doc = utils.createDocument();
    const next = reducer(
      doc,
      addOutcome({
        id: "o1",
        direction: "DECREASE",
        object: "the time to reach a binding decision",
        scope: "CORE",
        metric: "the time it takes",
      }),
    );
    const o = next.state.global.outcomes[0];
    expect(o.id).toBe("o1");
    expect(o.direction).toBe("DECREASE");
    expect(o.metric).toBe("the time it takes");
    expect(o.role).toBeNull();
    expect(o.relatedStep).toBeNull();
  });

  it("updates and clears outcome fields", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addOutcome({
        id: "o1",
        direction: "INCREASE",
        object: "participation",
        scope: "CORE",
        metric: "the number of members",
        role: "r1",
        relatedStep: "s1",
      }),
    );
    doc = reducer(doc, updateOutcome({ id: "o1", scope: "SPECIALIZED" }));
    expect(doc.state.global.outcomes[0].scope).toBe("SPECIALIZED");

    doc = reducer(doc, clearOutcomeMetric({ id: "o1" }));
    doc = reducer(doc, clearOutcomeRole({ id: "o1" }));
    doc = reducer(doc, clearOutcomeStep({ id: "o1" }));
    expect(doc.state.global.outcomes[0].metric).toBeNull();
    expect(doc.state.global.outcomes[0].role).toBeNull();
    expect(doc.state.global.outcomes[0].relatedStep).toBeNull();
  });

  it("reorders and removes outcomes", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addOutcome({
        id: "o1",
        direction: "SATISFY",
        object: "a",
        scope: "CORE",
      }),
    );
    doc = reducer(
      doc,
      addOutcome({ id: "o2", direction: "AVOID", object: "b", scope: "CORE" }),
    );
    doc = reducer(doc, reorderOutcomes({ ids: ["o2"], insertBefore: "o1" }));
    expect(doc.state.global.outcomes.map((o) => o.id)).toEqual(["o2", "o1"]);
    doc = reducer(doc, removeOutcome({ id: "o1" }));
    expect(doc.state.global.outcomes.map((o) => o.id)).toEqual(["o2"]);
  });

  it("rejects unknown outcome updates", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateOutcome({ id: "nope", object: "x" }))),
    ).toBeTruthy();
  });
});
