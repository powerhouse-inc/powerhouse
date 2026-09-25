import {
  assertIsConnectionDocument,
  assertIsConnectionState,
  initialGlobalState,
  initialLocalState,
  isConnectionDocument,
  isConnectionState,
  utils,
  connectionDocumentType,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Connection Document Model", () => {
  it("creates a document with the Connection type and initial state", () => {
    const document = utils.createDocument();
    expect(document.header.documentType).toBe(connectionDocumentType);
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isConnectionDocument(document)).toBe(true);
    expect(isConnectionState(document.state)).toBe(true);
    expect(() => assertIsConnectionDocument(document)).not.toThrow();
  });

  it("rejects a document of another type", () => {
    const document = utils.createDocument();
    document.header.documentType = "the-wrong-thing-1234";
    expect(isConnectionDocument(document)).toBe(false);
    expect(() => assertIsConnectionDocument(document)).toThrow();
  });

  it("rejects a document whose global state has the wrong shape", () => {
    const document = utils.createDocument();
    // @ts-expect-error - testing the error case
    document.state.global = { notWhat: "you want" };
    expect(isConnectionState(document.state)).toBe(false);
    expect(() => assertIsConnectionState(document.state)).toThrow(ZodError);
    expect(isConnectionDocument(document)).toBe(false);
    expect(() => assertIsConnectionDocument(document)).toThrow(ZodError);
  });

  it.each(["id", "name", "createdAtUtcIso", "lastModifiedAtUtcIso"] as const)(
    "rejects a document whose header lacks %s",
    (field) => {
      const document = utils.createDocument();
      delete (document.header as Partial<typeof document.header>)[field];
      expect(isConnectionDocument(document)).toBe(false);
      expect(() => assertIsConnectionDocument(document)).toThrow(ZodError);
    },
  );
});
