/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsFeatureDocument,
  assertIsFeatureState,
  featureDocumentType,
  initialGlobalState,
  initialLocalState,
  isFeatureDocument,
  isFeatureState,
  utils,
} from "document-models/feature/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Feature Document Model", () => {
  it("should create a new Feature document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(featureDocumentType);
  });

  it("should create a new Feature document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isFeatureDocument(document)).toBe(true);
    expect(isFeatureState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Feature document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsFeatureDocument(wrongDocumentType)).toThrow();
      expect(isFeatureDocument(wrongDocumentType)).toBe(false);
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
    expect(isFeatureState(wrongState.state)).toBe(false);
    expect(assertIsFeatureState(wrongState.state)).toThrow();
    expect(isFeatureDocument(wrongState)).toBe(false);
    expect(assertIsFeatureDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isFeatureState(wrongInitialState.state)).toBe(false);
    expect(assertIsFeatureState(wrongInitialState.state)).toThrow();
    expect(isFeatureDocument(wrongInitialState)).toBe(false);
    expect(assertIsFeatureDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isFeatureDocument(missingIdInHeader)).toBe(false);
    expect(assertIsFeatureDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isFeatureDocument(missingNameInHeader)).toBe(false);
    expect(assertIsFeatureDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isFeatureDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsFeatureDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isFeatureDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsFeatureDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
