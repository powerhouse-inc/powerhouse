import {
  addConstraint,
  reducer,
  removeConstraint,
  reorderConstraints,
  updateConstraint,
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

describe("Constraint operations", () => {
  it("adds, updates, reorders and removes constraints", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addConstraint({
        id: "c1",
        description: "Must satisfy reporting rules",
        severity: "HIGH",
      }),
    );
    doc = reducer(
      doc,
      addConstraint({
        id: "c2",
        description: "Limited budget",
        severity: "LOW",
      }),
    );
    expect(doc.state.global.constraints.map((c) => c.id)).toEqual(["c1", "c2"]);

    doc = reducer(doc, updateConstraint({ id: "c2", severity: "MEDIUM" }));
    expect(doc.state.global.constraints[1].severity).toBe("MEDIUM");

    doc = reducer(doc, reorderConstraints({ ids: ["c2"], insertBefore: "c1" }));
    expect(doc.state.global.constraints.map((c) => c.id)).toEqual(["c2", "c1"]);

    doc = reducer(doc, removeConstraint({ id: "c1" }));
    expect(doc.state.global.constraints.map((c) => c.id)).toEqual(["c2"]);
  });

  it("rejects a duplicate constraint id", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addConstraint({ id: "c1", description: "x", severity: "LOW" }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addConstraint({ id: "c1", description: "y", severity: "LOW" }),
        ),
      ),
    ).toBeTruthy();
  });
});
