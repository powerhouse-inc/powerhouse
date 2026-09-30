import { describe, expect, it } from "vitest";
import { isMissingDocumentError } from "../src/document-refetcher.js";

function named(name: string, message = "gone"): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("isMissingDocumentError", () => {
  it("treats a purged document as missing, like a deleted or unknown one", () => {
    expect(isMissingDocumentError(named("DocumentPurgedError"))).toBe(true);
    expect(isMissingDocumentError(named("DocumentNotFoundError"))).toBe(true);
    expect(isMissingDocumentError(named("DocumentDeletedError"))).toBe(true);
  });

  it("keeps any other failure", () => {
    expect(isMissingDocumentError(named("TypeError", "Failed to fetch"))).toBe(
      false,
    );
    expect(isMissingDocumentError("DocumentPurgedError")).toBe(false);
  });
});
