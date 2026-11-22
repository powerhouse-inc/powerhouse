import {
  clearContext,
  reducer,
  setContext,
  utils,
} from "document-models/problem-sheet/v1";
import { describe, expect, it } from "vitest";

describe("Context operations", () => {
  it("sets the context", () => {
    const doc = utils.createDocument();
    const next = reducer(
      doc,
      setContext({ context: "Groups sharing resources." }),
    );
    expect(next.state.global.context).toBe("Groups sharing resources.");
  });

  it("clears the context", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setContext({ context: "x" }));
    doc = reducer(doc, clearContext({}));
    expect(doc.state.global.context).toBeNull();
  });
});
