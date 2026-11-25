import {
  clearEstimates,
  reducer,
  setConfidence,
  setEffort,
  setFeatureName,
  setImpact,
  setPremise,
  setScope,
  utils,
} from "document-models/feature/v1";
import { describe, expect, it } from "vitest";

describe("Definition operations", () => {
  it("defaults scope and status, then sets bet fields", () => {
    const doc = utils.createDocument();
    expect(doc.state.global.scope).toBe("MICRO_MVP");
    expect(doc.state.global.status).toBe("PROPOSED");

    let next = reducer(doc, setFeatureName({ name: "Inline voting" }));
    next = reducer(next, setScope({ scope: "INCREMENTAL" }));
    next = reducer(
      next,
      setPremise({ premise: "Approve proposals in place." }),
    );
    expect(next.state.global.name).toBe("Inline voting");
    expect(next.state.global.scope).toBe("INCREMENTAL");
    expect(next.state.global.premise).toBe("Approve proposals in place.");
  });

  it("sets and clears estimates", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setConfidence({ confidence: "HIGH" }));
    doc = reducer(doc, setEffort({ effort: "SMALL" }));
    doc = reducer(doc, setImpact({ impact: "MEDIUM" }));
    expect(doc.state.global.confidence).toBe("HIGH");
    expect(doc.state.global.effort).toBe("SMALL");
    expect(doc.state.global.impact).toBe("MEDIUM");

    doc = reducer(doc, clearEstimates({}));
    expect(doc.state.global.confidence).toBeNull();
    expect(doc.state.global.effort).toBeNull();
    expect(doc.state.global.impact).toBeNull();
  });
});
