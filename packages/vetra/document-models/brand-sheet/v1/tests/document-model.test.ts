/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsBrandSheetDocument,
  assertIsBrandSheetState,
  brandSheetDocumentType,
  initialGlobalState,
  initialLocalState,
  isBrandSheetDocument,
  isBrandSheetState,
  utils,
} from "document-models/brand-sheet/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("BrandSheet Document Model", () => {
  it("should create a new BrandSheet document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(brandSheetDocumentType);
  });

  it("should create a new BrandSheet document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isBrandSheetDocument(document)).toBe(true);
    expect(isBrandSheetState(document.state)).toBe(true);
  });
  it("should reject a document that is not a BrandSheet document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsBrandSheetDocument(wrongDocumentType)).toThrow();
      expect(isBrandSheetDocument(wrongDocumentType)).toBe(false);
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
    expect(isBrandSheetState(wrongState.state)).toBe(false);
    expect(assertIsBrandSheetState(wrongState.state)).toThrow();
    expect(isBrandSheetDocument(wrongState)).toBe(false);
    expect(assertIsBrandSheetDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isBrandSheetState(wrongInitialState.state)).toBe(false);
    expect(assertIsBrandSheetState(wrongInitialState.state)).toThrow();
    expect(isBrandSheetDocument(wrongInitialState)).toBe(false);
    expect(assertIsBrandSheetDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isBrandSheetDocument(missingIdInHeader)).toBe(false);
    expect(assertIsBrandSheetDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isBrandSheetDocument(missingNameInHeader)).toBe(false);
    expect(assertIsBrandSheetDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isBrandSheetDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsBrandSheetDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isBrandSheetDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsBrandSheetDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
