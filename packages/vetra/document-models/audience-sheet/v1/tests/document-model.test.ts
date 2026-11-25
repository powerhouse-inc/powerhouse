/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsAudienceSheetDocument,
  assertIsAudienceSheetState,
  audienceSheetDocumentType,
  initialGlobalState,
  initialLocalState,
  isAudienceSheetDocument,
  isAudienceSheetState,
  utils,
} from "document-models/audience-sheet/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("AudienceSheet Document Model", () => {
  it("should create a new AudienceSheet document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(audienceSheetDocumentType);
  });

  it("should create a new AudienceSheet document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isAudienceSheetDocument(document)).toBe(true);
    expect(isAudienceSheetState(document.state)).toBe(true);
  });
  it("should reject a document that is not a AudienceSheet document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsAudienceSheetDocument(wrongDocumentType)).toThrow();
      expect(isAudienceSheetDocument(wrongDocumentType)).toBe(false);
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
    expect(isAudienceSheetState(wrongState.state)).toBe(false);
    expect(assertIsAudienceSheetState(wrongState.state)).toThrow();
    expect(isAudienceSheetDocument(wrongState)).toBe(false);
    expect(assertIsAudienceSheetDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isAudienceSheetState(wrongInitialState.state)).toBe(false);
    expect(assertIsAudienceSheetState(wrongInitialState.state)).toThrow();
    expect(isAudienceSheetDocument(wrongInitialState)).toBe(false);
    expect(assertIsAudienceSheetDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isAudienceSheetDocument(missingIdInHeader)).toBe(false);
    expect(assertIsAudienceSheetDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isAudienceSheetDocument(missingNameInHeader)).toBe(false);
    expect(assertIsAudienceSheetDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isAudienceSheetDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsAudienceSheetDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isAudienceSheetDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsAudienceSheetDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
