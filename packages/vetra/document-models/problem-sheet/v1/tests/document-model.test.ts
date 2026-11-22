/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsProblemSheetDocument,
  assertIsProblemSheetState,
  initialGlobalState,
  initialLocalState,
  isProblemSheetDocument,
  isProblemSheetState,
  problemSheetDocumentType,
  utils,
} from "document-models/problem-sheet/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("ProblemSheet Document Model", () => {
  it("should create a new ProblemSheet document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(problemSheetDocumentType);
  });

  it("should create a new ProblemSheet document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isProblemSheetDocument(document)).toBe(true);
    expect(isProblemSheetState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ProblemSheet document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsProblemSheetDocument(wrongDocumentType)).toThrow();
      expect(isProblemSheetDocument(wrongDocumentType)).toBe(false);
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
    expect(isProblemSheetState(wrongState.state)).toBe(false);
    expect(assertIsProblemSheetState(wrongState.state)).toThrow();
    expect(isProblemSheetDocument(wrongState)).toBe(false);
    expect(assertIsProblemSheetDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isProblemSheetState(wrongInitialState.state)).toBe(false);
    expect(assertIsProblemSheetState(wrongInitialState.state)).toThrow();
    expect(isProblemSheetDocument(wrongInitialState)).toBe(false);
    expect(assertIsProblemSheetDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isProblemSheetDocument(missingIdInHeader)).toBe(false);
    expect(assertIsProblemSheetDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isProblemSheetDocument(missingNameInHeader)).toBe(false);
    expect(assertIsProblemSheetDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isProblemSheetDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsProblemSheetDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isProblemSheetDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsProblemSheetDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
