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
  todoDocumentType,
  isTodoDocument,
  assertIsTodoDocument,
  isTodoState,
  assertIsTodoState,
} from "versioned-documents/document-models/todo/v2";
import { ZodError } from "zod";

describe("Todo Document Model", () => {
  it("should create a new Todo document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(todoDocumentType);
  });

  it("should create a new Todo document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isTodoDocument(document)).toBe(true);
    expect(isTodoState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Todo document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsTodoDocument(wrongDocumentType)).toThrow();
      expect(isTodoDocument(wrongDocumentType)).toBe(false);
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
    expect(isTodoState(wrongState.state)).toBe(false);
    expect(assertIsTodoState(wrongState.state)).toThrow();
    expect(isTodoDocument(wrongState)).toBe(false);
    expect(assertIsTodoDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isTodoState(wrongInitialState.state)).toBe(false);
    expect(assertIsTodoState(wrongInitialState.state)).toThrow();
    expect(isTodoDocument(wrongInitialState)).toBe(false);
    expect(assertIsTodoDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isTodoDocument(missingIdInHeader)).toBe(false);
    expect(assertIsTodoDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isTodoDocument(missingNameInHeader)).toBe(false);
    expect(assertIsTodoDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isTodoDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsTodoDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isTodoDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsTodoDocument(missingLastModifiedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
