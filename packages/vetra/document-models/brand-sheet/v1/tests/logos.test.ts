import {
  addLogo,
  clearLogoAsset,
  reducer,
  removeLogo,
  reorderLogos,
  setLogoAsset,
  updateLogo,
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

describe("Logo operations", () => {
  it("adds, updates, reorders and removes logos", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addLogo({ id: "l1", description: "Primary", markType: "WORDMARK" }),
    );
    doc = reducer(
      doc,
      addLogo({ id: "l2", description: "Icon", markType: "SYMBOL" }),
    );
    expect(doc.state.global.logos.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(doc.state.global.logos[0].assetData).toBeNull();

    doc = reducer(doc, updateLogo({ id: "l1", markType: "COMBINATION" }));
    expect(doc.state.global.logos[0].markType).toBe("COMBINATION");

    doc = reducer(doc, reorderLogos({ ids: ["l2"], insertBefore: "l1" }));
    expect(doc.state.global.logos.map((l) => l.id)).toEqual(["l2", "l1"]);

    doc = reducer(doc, removeLogo({ id: "l2" }));
    expect(doc.state.global.logos.map((l) => l.id)).toEqual(["l1"]);
  });

  it("sets and clears a logo asset", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addLogo({ id: "l1", description: "Primary", markType: "WORDMARK" }),
    );
    doc = reducer(
      doc,
      setLogoAsset({
        logoId: "l1",
        data: "aGVsbG8=",
        mediaType: "image/png",
        filename: "logo.png",
      }),
    );
    expect(doc.state.global.logos[0].assetData).toBe("aGVsbG8=");
    expect(doc.state.global.logos[0].assetMediaType).toBe("image/png");

    doc = reducer(doc, clearLogoAsset({ logoId: "l1" }));
    expect(doc.state.global.logos[0].assetData).toBeNull();
    expect(doc.state.global.logos[0].assetMediaType).toBeNull();
  });

  it("rejects duplicate ids and unknown logos", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addLogo({ id: "l1", description: "A", markType: "WORDMARK" }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addLogo({ id: "l1", description: "B", markType: "SYMBOL" }),
        ),
      ),
    ).toBeTruthy();
    expect(
      failure(() => reducer(doc, setLogoAsset({ logoId: "nope", data: "x" }))),
    ).toBeTruthy();
  });
});
