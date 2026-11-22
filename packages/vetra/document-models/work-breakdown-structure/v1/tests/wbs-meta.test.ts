import {
  clearFeature,
  reducer,
  setFeature,
  setWbsName,
  updateFeatureSnippet,
  utils,
} from "document-models/work-breakdown-structure/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("WBS meta operations", () => {
  it("sets the name and the cached Feature reference", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setWbsName({ name: "Concord v1 WBS" }));
    expect(doc.state.global.name).toBe("Concord v1 WBS");

    doc = reducer(
      doc,
      setFeature({
        documentId: "phd:feature:v1",
        name: "Concord v1",
        status: "COMMITTED",
      }),
    );
    expect(doc.state.global.feature).toEqual({
      documentId: "phd:feature:v1",
      name: "Concord v1",
      status: "COMMITTED",
    });

    doc = reducer(doc, updateFeatureSnippet({ status: "IN_SPEC" }));
    expect(doc.state.global.feature?.status).toBe("IN_SPEC");

    doc = reducer(doc, clearFeature({}));
    expect(doc.state.global.feature).toBeNull();
  });

  it("rejects refreshing the Feature snippet when not set", () => {
    const doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateFeatureSnippet({ status: "x" }))),
    ).toBeTruthy();
  });
});
