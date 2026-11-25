/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsWorkBreakdownStructureDocument,
  assertIsWorkBreakdownStructureState,
  initialGlobalState,
  initialLocalState,
  isWorkBreakdownStructureDocument,
  isWorkBreakdownStructureState,
  utils,
  workBreakdownStructureDocumentType,
} from "document-models/work-breakdown-structure/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("WorkBreakdownStructure Document Model", () => {
  it("should create a new WorkBreakdownStructure document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(
      workBreakdownStructureDocumentType,
    );
  });

  it("should create a new WorkBreakdownStructure document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isWorkBreakdownStructureDocument(document)).toBe(true);
    expect(isWorkBreakdownStructureState(document.state)).toBe(true);
  });
  it("should reject a document that is not a WorkBreakdownStructure document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(
        assertIsWorkBreakdownStructureDocument(wrongDocumentType),
      ).toThrow();
      expect(isWorkBreakdownStructureDocument(wrongDocumentType)).toBe(false);
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
    expect(isWorkBreakdownStructureState(wrongState.state)).toBe(false);
    expect(assertIsWorkBreakdownStructureState(wrongState.state)).toThrow();
    expect(isWorkBreakdownStructureDocument(wrongState)).toBe(false);
    expect(assertIsWorkBreakdownStructureDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isWorkBreakdownStructureState(wrongInitialState.state)).toBe(false);
    expect(
      assertIsWorkBreakdownStructureState(wrongInitialState.state),
    ).toThrow();
    expect(isWorkBreakdownStructureDocument(wrongInitialState)).toBe(false);
    expect(assertIsWorkBreakdownStructureDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isWorkBreakdownStructureDocument(missingIdInHeader)).toBe(false);
    expect(assertIsWorkBreakdownStructureDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isWorkBreakdownStructureDocument(missingNameInHeader)).toBe(false);
    expect(
      assertIsWorkBreakdownStructureDocument(missingNameInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(
      isWorkBreakdownStructureDocument(missingCreatedAtUtcIsoInHeader),
    ).toBe(false);
    expect(
      assertIsWorkBreakdownStructureDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(
      isWorkBreakdownStructureDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toBe(false);
    expect(
      assertIsWorkBreakdownStructureDocument(
        missingLastModifiedAtUtcIsoInHeader,
      ),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
