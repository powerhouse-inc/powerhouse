import {
  addColor,
  reducer,
  removeColor,
  reorderColors,
  updateColor,
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

describe("Color operations", () => {
  it("adds, updates, reorders and removes colors", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addColor({
        id: "c1",
        role: "PRIMARY",
        name: "Ink",
        hex: "#101820",
        usage: "Text",
      }),
    );
    doc = reducer(
      doc,
      addColor({
        id: "c2",
        role: "ACCENT",
        name: "Citrus",
        hex: "#F2A900",
        usage: "Highlights",
      }),
    );
    expect(doc.state.global.colors.map((c) => c.id)).toEqual(["c1", "c2"]);

    doc = reducer(doc, updateColor({ id: "c2", hex: "#FFB000" }));
    expect(doc.state.global.colors[1].hex).toBe("#FFB000");

    doc = reducer(doc, reorderColors({ ids: ["c2"], insertBefore: "c1" }));
    expect(doc.state.global.colors.map((c) => c.id)).toEqual(["c2", "c1"]);

    doc = reducer(doc, removeColor({ id: "c1" }));
    expect(doc.state.global.colors.map((c) => c.id)).toEqual(["c2"]);
  });

  it("rejects a duplicate id", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addColor({
        id: "c1",
        role: "PRIMARY",
        name: "Ink",
        hex: "#101820",
        usage: "Text",
      }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addColor({
            id: "c1",
            role: "TEXT",
            name: "Ink2",
            hex: "#000000",
            usage: "Body",
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
