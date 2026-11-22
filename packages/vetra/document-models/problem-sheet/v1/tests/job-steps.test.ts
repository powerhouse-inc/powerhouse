import {
  addJobStep,
  reducer,
  removeJobStep,
  reorderJobSteps,
  updateJobStep,
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

describe("Job step operations", () => {
  it("adds steps and preserves insertion order", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addJobStep({ id: "s1", name: "Define", category: "DEFINE" }),
    );
    doc = reducer(
      doc,
      addJobStep({ id: "s2", name: "Execute", category: "EXECUTE" }),
    );
    expect(doc.state.global.coreJobSteps.map((s) => s.id)).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("inserts a step before an anchor", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addJobStep({ id: "s1", name: "Define", category: "DEFINE" }),
    );
    doc = reducer(
      doc,
      addJobStep({ id: "s2", name: "Execute", category: "EXECUTE" }),
    );
    doc = reducer(
      doc,
      addJobStep({
        id: "s3",
        name: "Prepare",
        category: "PREPARE",
        insertBefore: "s2",
      }),
    );
    expect(doc.state.global.coreJobSteps.map((s) => s.id)).toEqual([
      "s1",
      "s3",
      "s2",
    ]);
  });

  it("rejects a duplicate step id", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addJobStep({ id: "s1", name: "Define", category: "DEFINE" }),
    );
    expect(
      failure(() =>
        reducer(doc, addJobStep({ id: "s1", name: "Dup", category: "LOCATE" })),
      ),
    ).toBeTruthy();
  });

  it("updates a step in place", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addJobStep({ id: "s1", name: "Define", category: "DEFINE" }),
    );
    doc = reducer(doc, updateJobStep({ id: "s1", name: "Frame the problem" }));
    expect(doc.state.global.coreJobSteps[0].name).toBe("Frame the problem");
    expect(doc.state.global.coreJobSteps[0].category).toBe("DEFINE");
  });

  it("rejects updating an unknown step", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateJobStep({ id: "nope", name: "x" }))),
    ).toBeTruthy();
  });

  it("removes a step", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addJobStep({ id: "s1", name: "Define", category: "DEFINE" }),
    );
    doc = reducer(doc, removeJobStep({ id: "s1" }));
    expect(doc.state.global.coreJobSteps).toHaveLength(0);
  });

  it("reorders steps by moving an id before an anchor", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addJobStep({ id: "s1", name: "a", category: "DEFINE" }));
    doc = reducer(doc, addJobStep({ id: "s2", name: "b", category: "LOCATE" }));
    doc = reducer(
      doc,
      addJobStep({ id: "s3", name: "c", category: "EXECUTE" }),
    );
    doc = reducer(doc, reorderJobSteps({ ids: ["s3"], insertBefore: "s1" }));
    expect(doc.state.global.coreJobSteps.map((s) => s.id)).toEqual([
      "s3",
      "s1",
      "s2",
    ]);
  });
});
