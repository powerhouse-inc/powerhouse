import {
  clearParentFeature,
  clearRole,
  reducer,
  setParentFeature,
  setRelatedStep,
  setRole,
  setWbs,
  updateRoleSnippet,
  updateWbsSnippet,
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

describe("Singular reference operations", () => {
  it("sets, refreshes and clears the role reference", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setRole({
        documentId: PROBLEM,
        objectId: "role-treasurer",
        name: "Treasurer",
        kind: "PRIMARY",
      }),
    );
    expect(doc.state.global.role).toEqual({
      documentId: PROBLEM,
      objectId: "role-treasurer",
      name: "Treasurer",
      kind: "PRIMARY",
    });

    doc = reducer(doc, updateRoleSnippet({ name: "Group Treasurer" }));
    expect(doc.state.global.role?.name).toBe("Group Treasurer");

    doc = reducer(doc, clearRole({}));
    expect(doc.state.global.role).toBeNull();
  });

  it("sets related step, parent feature and wbs references", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setRelatedStep({
        documentId: PROBLEM,
        objectId: "step-decide",
        name: "Decide",
        category: "CONFIRM",
      }),
    );
    expect(doc.state.global.relatedStep?.category).toBe("CONFIRM");

    doc = reducer(
      doc,
      setParentFeature({
        documentId: "phd:feature:v1",
        name: "Concord v1",
        status: "COMMITTED",
      }),
    );
    expect(doc.state.global.parentFeature?.status).toBe("COMMITTED");

    doc = reducer(
      doc,
      setWbs({
        documentId: "phd:wbs:v1",
        name: "Concord v1 WBS",
        status: "ACTIVE",
      }),
    );
    expect(doc.state.global.wbs?.documentId).toBe("phd:wbs:v1");

    doc = reducer(doc, updateWbsSnippet({ status: "COMPLETE" }));
    expect(doc.state.global.wbs?.status).toBe("COMPLETE");

    doc = reducer(doc, clearParentFeature({}));
    expect(doc.state.global.parentFeature).toBeNull();
  });

  it("rejects refreshing a snippet that is not set", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateRoleSnippet({ name: "x" }))),
    ).toBeTruthy();
    expect(
      failure(() => reducer(doc, updateWbsSnippet({ status: "x" }))),
    ).toBeTruthy();
  });
});
