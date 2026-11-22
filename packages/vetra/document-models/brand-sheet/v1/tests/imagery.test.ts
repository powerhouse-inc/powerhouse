import {
  addImageryReference,
  clearImageryDirection,
  reducer,
  removeImageryReference,
  reorderImageryReferences,
  setImageryDirection,
  setImageryGuidance,
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

describe("Imagery operations", () => {
  it("lazily creates the imagery block when setting direction", () => {
    let doc = utils.createDocument();
    expect(doc.state.global.imagery).toBeNull();
    doc = reducer(
      doc,
      setImageryDirection({ direction: "Warm, candid, domestic." }),
    );
    expect(doc.state.global.imagery?.direction).toBe("Warm, candid, domestic.");
    expect(doc.state.global.imagery?.references).toEqual([]);
  });

  it("sets guidance and manages reference images", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setImageryGuidance({
        include: ["people", "homes"],
        avoid: ["stock smiles"],
      }),
    );
    expect(doc.state.global.imagery?.include).toEqual(["people", "homes"]);

    doc = reducer(
      doc,
      addImageryReference({ id: "i1", url: "https://example.com/a.jpg" }),
    );
    doc = reducer(
      doc,
      addImageryReference({ id: "i2", data: "Zm9v", mediaType: "image/jpeg" }),
    );
    expect(doc.state.global.imagery?.references.map((r) => r.id)).toEqual([
      "i1",
      "i2",
    ]);

    doc = reducer(
      doc,
      reorderImageryReferences({ ids: ["i2"], insertBefore: "i1" }),
    );
    expect(doc.state.global.imagery?.references.map((r) => r.id)).toEqual([
      "i2",
      "i1",
    ]);

    doc = reducer(doc, removeImageryReference({ id: "i1" }));
    expect(doc.state.global.imagery?.references.map((r) => r.id)).toEqual([
      "i2",
    ]);

    doc = reducer(doc, clearImageryDirection({}));
    expect(doc.state.global.imagery?.direction).toBeNull();
  });

  it("rejects removing a reference when none exists", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, removeImageryReference({ id: "nope" }))),
    ).toBeTruthy();
  });
});
