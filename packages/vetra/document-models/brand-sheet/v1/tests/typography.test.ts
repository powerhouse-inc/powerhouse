import {
  addTypeface,
  reducer,
  removeTypeface,
  reorderTypefaces,
  updateTypeface,
  utils,
} from "document-models/brand-sheet/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Typography operations", () => {
  it("adds, updates, reorders and removes typefaces", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addTypeface({
        id: "t1",
        role: "HEADLINE",
        family: "Fraunces",
        alternatives: ["Georgia"],
      }),
    );
    doc = reducer(
      doc,
      addTypeface({
        id: "t2",
        role: "BODY",
        family: "Inter",
        alternatives: [],
      }),
    );
    expect(doc.state.global.typography.map((t) => t.id)).toEqual(["t1", "t2"]);

    doc = reducer(
      doc,
      updateTypeface({ id: "t2", alternatives: ["Helvetica", "Arial"] }),
    );
    expect(doc.state.global.typography[1].alternatives).toEqual([
      "Helvetica",
      "Arial",
    ]);

    doc = reducer(doc, reorderTypefaces({ ids: ["t2"], insertBefore: "t1" }));
    expect(doc.state.global.typography.map((t) => t.id)).toEqual(["t2", "t1"]);

    doc = reducer(doc, removeTypeface({ id: "t1" }));
    expect(doc.state.global.typography.map((t) => t.id)).toEqual(["t2"]);
  });

  it("rejects updating an unknown typeface", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateTypeface({ id: "nope", family: "x" }))),
    ).toBeTruthy();
  });
});
