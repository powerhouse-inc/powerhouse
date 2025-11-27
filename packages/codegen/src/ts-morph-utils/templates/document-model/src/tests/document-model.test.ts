import { ts } from "@tmpl/core";
import type { DocumentModelVariableNames } from "../../../../name-builders/types.js";

export const documentModelTestFileTemplate = (
  v: DocumentModelVariableNames,
) => ts`
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
  ${v.documentTypeVariableName},
  ${v.isPhDocumentOfTypeFunctionName},
  ${v.assertIsPhDocumentOfTypeFunctionName},
  ${v.isPhStateOfTypeFunctionName},
  ${v.assertIsPhStateOfTypeFunctionName},
} from "${v.documentModelDir}";
import { ZodError } from "zod";

describe("${v.pascalCaseDocumentType} Document Model", () => {
  it("should create a new ${v.pascalCaseDocumentType} document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(${v.documentTypeVariableName});
  });

  it("should create a new ${v.pascalCaseDocumentType} document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(${v.isPhDocumentOfTypeFunctionName}(document)).toBe(true);
    expect(${v.isPhStateOfTypeFunctionName}(document.state)).toBe(true);
  });
  it("should reject a document that is not a ${v.pascalCaseDocumentType} document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(${v.assertIsPhDocumentOfTypeFunctionName}(wrongDocumentType)).toThrow();
      expect(${v.isPhDocumentOfTypeFunctionName}(wrongDocumentType)).toBe(false);
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
    expect(${v.isPhStateOfTypeFunctionName}(wrongState.state)).toBe(false);
    expect(${v.assertIsPhStateOfTypeFunctionName}(wrongState.state)).toThrow();
    expect(${v.isPhDocumentOfTypeFunctionName}(wrongState)).toBe(false);
    expect(${v.assertIsPhDocumentOfTypeFunctionName}(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(${v.isPhStateOfTypeFunctionName}(wrongInitialState.state)).toBe(false);
    expect(${v.assertIsPhStateOfTypeFunctionName}(wrongInitialState.state)).toThrow();
    expect(${v.isPhDocumentOfTypeFunctionName}(wrongInitialState)).toBe(false);
    expect(${v.assertIsPhDocumentOfTypeFunctionName}(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(${v.isPhDocumentOfTypeFunctionName}(missingIdInHeader)).toBe(false);
    expect(${v.assertIsPhDocumentOfTypeFunctionName}(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(${v.isPhDocumentOfTypeFunctionName}(missingNameInHeader)).toBe(false);
    expect(${v.assertIsPhDocumentOfTypeFunctionName}(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(${v.isPhDocumentOfTypeFunctionName}(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(${v.assertIsPhDocumentOfTypeFunctionName}(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(${v.isPhDocumentOfTypeFunctionName}(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      ${v.assertIsPhDocumentOfTypeFunctionName}(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
`.raw;
