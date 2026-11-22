import {
  clearConcept,
  clearMaxim,
  clearProductName,
  reducer,
  setConcept,
  setMaxim,
  setProductName,
  utils,
} from "document-models/brand-sheet/v1";
import { describe, expect, it } from "vitest";

describe("Identity operations", () => {
  it("sets and clears name, maxim, and concept", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setProductName({ name: "Concord" }));
    doc = reducer(
      doc,
      setMaxim({ maxim: "Share the burden. Keep the savings." }),
    );
    doc = reducer(doc, setConcept({ concept: "Shared-affairs coordination." }));
    expect(doc.state.global.name).toBe("Concord");
    expect(doc.state.global.maxim).toBe("Share the burden. Keep the savings.");
    expect(doc.state.global.concept).toBe("Shared-affairs coordination.");

    doc = reducer(doc, clearProductName({}));
    doc = reducer(doc, clearMaxim({}));
    doc = reducer(doc, clearConcept({}));
    expect(doc.state.global.name).toBeNull();
    expect(doc.state.global.maxim).toBeNull();
    expect(doc.state.global.concept).toBeNull();
  });
});
