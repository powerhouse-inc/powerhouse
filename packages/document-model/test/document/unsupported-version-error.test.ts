import { UnsupportedDocumentModelVersionError } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";

describe("UnsupportedDocumentModelVersionError", () => {
  it("carries the document type, required version, and available versions", () => {
    const error = new UnsupportedDocumentModelVersionError("test/todo", 2, [1]);
    expect(error.name).toBe("UnsupportedDocumentModelVersionError");
    expect(error.documentType).toBe("test/todo");
    expect(error.requiredVersion).toBe(2);
    expect(error.availableVersions).toEqual([1]);
    expect(error.message).toBe(
      "No reducer registered for document version 2. Available versions: 1",
    );
  });

  it("is detected by the isError guard", () => {
    const error = new UnsupportedDocumentModelVersionError("test/todo", 2, [1]);
    expect(UnsupportedDocumentModelVersionError.isError(error)).toBe(true);
    expect(UnsupportedDocumentModelVersionError.isError(new Error("x"))).toBe(
      false,
    );
  });
});
