import {
  addEvidence,
  reducer,
  removeEvidence,
  updateEvidence,
  utils,
} from "document-models/feature/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Evidence operations", () => {
  it("adds, updates and removes evidence", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addEvidence({
        id: "e1",
        source: "BUILDER",
        content: "Coherent with the v1 bet.",
      }),
    );
    expect(doc.state.global.evidence[0].source).toBe("BUILDER");
    expect(doc.state.global.evidence[0].recordedAt).toBeNull();

    doc = reducer(doc, updateEvidence({ id: "e1", source: "AI_SIMULATION" }));
    expect(doc.state.global.evidence[0].source).toBe("AI_SIMULATION");

    doc = reducer(doc, removeEvidence({ id: "e1" }));
    expect(doc.state.global.evidence).toHaveLength(0);
  });

  it("rejects a duplicate evidence id", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addEvidence({ id: "e1", source: "BUILDER", content: "x" }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addEvidence({ id: "e1", source: "BUILDER", content: "y" }),
        ),
      ),
    ).toBeTruthy();
  });
});
