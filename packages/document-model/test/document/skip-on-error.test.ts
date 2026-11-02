import { baseCreateDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  countReducer,
  createCountDocumentState,
  error,
  increment,
  testCreateBaseState,
} from "../helpers.js";

describe("an action that fails with a skip", () => {
  it("keeps the rewind and the skip", () => {
    let document = baseCreateDocument(
      createCountDocumentState,
      testCreateBaseState({ count: 0 }, { name: "" }),
    );
    document = countReducer(document, increment());
    document = countReducer(document, increment());
    document = countReducer(document, increment());

    document = countReducer(document, error(), undefined, { skip: 2 });

    const failed = document.operations.global.at(-1);
    expect(document.state.global.count).toBe(1);
    expect(failed?.error).toBe("Error action");
    expect(failed?.skip).toBe(2);
  });
});
