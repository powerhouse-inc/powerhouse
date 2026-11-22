import {
  addSegmentRef,
  reducer,
  removeSegmentRef,
  reorderSegmentRefs,
  updateSegmentRefSnippet,
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

const AUDIENCE = "phd:audience-sheet:1";

describe("Segment reference operations", () => {
  it("adds, refreshes, reorders and removes segment references", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addSegmentRef({
        id: "sr1",
        documentId: AUDIENCE,
        objectId: "seg-condo",
        name: "Condo boards",
      }),
    );
    doc = reducer(
      doc,
      addSegmentRef({
        id: "sr2",
        documentId: AUDIENCE,
        objectId: "seg-cohousing",
        name: "Co-housing",
      }),
    );
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["sr1", "sr2"]);

    doc = reducer(
      doc,
      updateSegmentRefSnippet({ id: "sr1", name: "Self-managed condo boards" }),
    );
    expect(doc.state.global.segments[0].name).toBe("Self-managed condo boards");
    expect(doc.state.global.segments[0].objectId).toBe("seg-condo");

    doc = reducer(
      doc,
      reorderSegmentRefs({ ids: ["sr2"], insertBefore: "sr1" }),
    );
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["sr2", "sr1"]);

    doc = reducer(doc, removeSegmentRef({ id: "sr1" }));
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["sr2"]);
  });

  it("rejects refreshing an unknown segment reference", () => {
    const doc = utils.createDocument();
    expect(
      failure(() =>
        reducer(doc, updateSegmentRefSnippet({ id: "nope", name: "x" })),
      ),
    ).toBeTruthy();
  });
});
