/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

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
  it("should create a new Workflow document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(workflowDocumentType);
  });

  it("should create a new Workflow document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isWorkflowDocument(document)).toBe(true);
    expect(isWorkflowState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Workflow document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsWorkflowDocument(wrongDocumentType)).toThrow();
      expect(isWorkflowDocument(wrongDocumentType)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
  });
  const wrongState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongState.state.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isWorkflowState(wrongState.state)).toBe(false);
    expect(assertIsWorkflowState(wrongState.state)).toThrow();
    expect(isWorkflowDocument(wrongState)).toBe(false);
    expect(assertIsWorkflowDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isWorkflowState(wrongInitialState.state)).toBe(false);
    expect(assertIsWorkflowState(wrongInitialState.state)).toThrow();
    expect(isWorkflowDocument(wrongInitialState)).toBe(false);
    expect(assertIsWorkflowDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isWorkflowDocument(missingIdInHeader)).toBe(false);
    expect(assertIsWorkflowDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isWorkflowDocument(missingNameInHeader)).toBe(false);
    expect(assertIsWorkflowDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isWorkflowDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsWorkflowDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isWorkflowDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsWorkflowDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
