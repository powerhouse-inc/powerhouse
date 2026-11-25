import {
  addOutcomeTarget,
  reducer,
  removeOutcomeTarget,
  reorderOutcomeTargets,
  updateOutcomeTarget,
  updateOutcomeTargetSnippet,
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

const PROBLEM = "phd:problem-sheet:1";

describe("Outcome target operations", () => {
  it("adds a target with a cached outcome snippet and projected deltas", () => {
    const doc = utils.createDocument();
    const next = reducer(
      doc,
      addOutcomeTarget({
        id: "t1",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o-decision-time",
        outcomeStatement: "Decrease decision time",
        outcomeScope: "CORE",
        expectedSatisfactionChange: 3,
      }),
    );
    const target = next.state.global.targets[0];
    expect(target.outcome).toEqual({
      documentId: PROBLEM,
      objectId: "o-decision-time",
      statement: "Decrease decision time",
      scope: "CORE",
    });
    expect(target.expectedSatisfactionChange).toBe(3);
    expect(target.expectedImportanceChange).toBeNull();
  });

  it("updates deltas, refreshes the snippet, reorders and removes", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addOutcomeTarget({
        id: "t1",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o1",
      }),
    );
    doc = reducer(
      doc,
      addOutcomeTarget({
        id: "t2",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o2",
      }),
    );
    doc = reducer(
      doc,
      updateOutcomeTarget({ id: "t1", expectedImportanceChange: 2 }),
    );
    expect(doc.state.global.targets[0].expectedImportanceChange).toBe(2);

    doc = reducer(
      doc,
      updateOutcomeTargetSnippet({
        id: "t1",
        statement: "Avoid double-booking",
      }),
    );
    expect(doc.state.global.targets[0].outcome.statement).toBe(
      "Avoid double-booking",
    );

    doc = reducer(
      doc,
      reorderOutcomeTargets({ ids: ["t2"], insertBefore: "t1" }),
    );
    expect(doc.state.global.targets.map((t) => t.id)).toEqual(["t2", "t1"]);

    doc = reducer(doc, removeOutcomeTarget({ id: "t1" }));
    expect(doc.state.global.targets.map((t) => t.id)).toEqual(["t2"]);
  });

  it("rejects a duplicate id", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addOutcomeTarget({
        id: "t1",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o1",
      }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addOutcomeTarget({
            id: "t1",
            outcomeDocumentId: PROBLEM,
            outcomeObjectId: "o2",
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
