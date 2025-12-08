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
  testEmptyCodesDocumentType,
  isTestEmptyCodesDocument,
  assertIsTestEmptyCodesDocument,
  isTestEmptyCodesState,
  assertIsTestEmptyCodesState,
} from "test/document-models/test-empty-codes/v2";
import { ZodError } from "zod";

describe("TestEmptyCodes Document Model", () => {
  it("should create a new TestEmptyCodes document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(testEmptyCodesDocumentType);
  });

  it("should create a new TestEmptyCodes document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isTestEmptyCodesDocument(document)).toBe(true);
    expect(isTestEmptyCodesState(document.state)).toBe(true);
  });
  it("should reject a document that is not a TestEmptyCodes document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsTestEmptyCodesDocument(wrongDocumentType)).toThrow();
      expect(isTestEmptyCodesDocument(wrongDocumentType)).toBe(false);
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
    expect(isTestEmptyCodesState(wrongState.state)).toBe(false);
    expect(assertIsTestEmptyCodesState(wrongState.state)).toThrow();
    expect(isTestEmptyCodesDocument(wrongState)).toBe(false);
    expect(assertIsTestEmptyCodesDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isTestEmptyCodesState(wrongInitialState.state)).toBe(false);
    expect(assertIsTestEmptyCodesState(wrongInitialState.state)).toThrow();
    expect(isTestEmptyCodesDocument(wrongInitialState)).toBe(false);
    expect(assertIsTestEmptyCodesDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isTestEmptyCodesDocument(missingIdInHeader)).toBe(false);
    expect(assertIsTestEmptyCodesDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isTestEmptyCodesDocument(missingNameInHeader)).toBe(false);
    expect(assertIsTestEmptyCodesDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isTestEmptyCodesDocument(missingCreatedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsTestEmptyCodesDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isTestEmptyCodesDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsTestEmptyCodesDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
