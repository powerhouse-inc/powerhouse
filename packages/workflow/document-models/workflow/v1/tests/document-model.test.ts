import {
  assertIsWorkflowDocument,
  assertIsWorkflowState,
  initialGlobalState,
  initialLocalState,
  isWorkflowDocument,
  isWorkflowState,
  utils,
  workflowDocumentType,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Workflow Document Model", () => {
  it("creates a document with the Workflow type and initial state", () => {
    const document = utils.createDocument();
    expect(document.header.documentType).toBe(workflowDocumentType);
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isWorkflowDocument(document)).toBe(true);
    expect(isWorkflowState(document.state)).toBe(true);
    expect(() => assertIsWorkflowDocument(document)).not.toThrow();
  });

  it("rejects a document of another type", () => {
    const document = utils.createDocument();
    document.header.documentType = "the-wrong-thing-1234";
    expect(isWorkflowDocument(document)).toBe(false);
    expect(() => assertIsWorkflowDocument(document)).toThrow();
  });

  it("rejects a document whose global state has the wrong shape", () => {
    const document = utils.createDocument();
    // @ts-expect-error - testing the error case
    document.state.global = { notWhat: "you want" };
    expect(isWorkflowState(document.state)).toBe(false);
    expect(() => assertIsWorkflowState(document.state)).toThrow(ZodError);
    expect(isWorkflowDocument(document)).toBe(false);
    expect(() => assertIsWorkflowDocument(document)).toThrow(ZodError);
  });

  it.each(["id", "name", "createdAtUtcIso", "lastModifiedAtUtcIso"] as const)(
    "rejects a document whose header lacks %s",
    (field) => {
      const document = utils.createDocument();
      delete (document.header as Partial<typeof document.header>)[field];
      expect(isWorkflowDocument(document)).toBe(false);
      expect(() => assertIsWorkflowDocument(document)).toThrow(ZodError);
    },
  );
});
