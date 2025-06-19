/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, expect, it } from "vitest";
import {
  createDocument,
  initialGlobalState,
  initialLocalState,
} from "../../gen/utils.js";

describe("Document Drive Document Model", () => {
  it("should create a new Document Drive document", () => {
    const document = createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe("powerhouse/document-drive");
  });

  it("should create a new Document Drive document with a valid initial state", () => {
    const document = createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
  });
});
