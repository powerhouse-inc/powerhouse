/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from "vitest";
import {
  utils,
  initialGlobalState,
  initialLocalState,
  toDoDocumentDocumentType,
  isToDoDocumentDocument,
  assertIsToDoDocumentDocument,
  isToDoDocumentState,
  assertIsToDoDocumentState,
} from "connect-e2e/document-models/to-do-document";
import { ZodError } from "zod";

describe("ToDoDocument Document Model", () => {
  it("should create a new ToDoDocument document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(toDoDocumentDocumentType);
  });

  it("should create a new ToDoDocument document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isToDoDocumentDocument(document)).toBe(true);
    expect(isToDoDocumentState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ToDoDocument document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsToDoDocumentDocument(wrongDocumentType)).toThrow();
      expect(isToDoDocumentDocument(wrongDocumentType)).toBe(false);
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
    expect(isToDoDocumentState(wrongState.state)).toBe(false);
    expect(assertIsToDoDocumentState(wrongState.state)).toThrow();
    expect(isToDoDocumentDocument(wrongState)).toBe(false);
    expect(assertIsToDoDocumentDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isToDoDocumentState(wrongInitialState.state)).toBe(false);
    expect(assertIsToDoDocumentState(wrongInitialState.state)).toThrow();
    expect(isToDoDocumentDocument(wrongInitialState)).toBe(false);
    expect(assertIsToDoDocumentDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isToDoDocumentDocument(missingIdInHeader)).toBe(false);
    expect(assertIsToDoDocumentDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isToDoDocumentDocument(missingNameInHeader)).toBe(false);
    expect(assertIsToDoDocumentDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isToDoDocumentDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsToDoDocumentDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isToDoDocumentDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsToDoDocumentDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
