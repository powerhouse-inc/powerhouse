---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/src/tests/document-model.test.ts"
unless_exists: true
---
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
  <%= documentTypeVariableName %>,
  <%= isPhDocumentOfTypeFunctionName %>,
  <%= assertIsPhDocumentOfTypeFunctionName %>,
  <%= isPhStateOfTypeFunctionName %>,
  <%= assertIsPhStateOfTypeFunctionName %>,
} from "<%= documentModelDir %>";
import { ZodError } from "zod";

describe("<%= pascalCaseDocumentType %> Document Model", () => {
  it("should create a new <%= pascalCaseDocumentType %> document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(<%= documentTypeVariableName %>);
  });

  it("should create a new <%= pascalCaseDocumentType %> document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(<%= isPhDocumentOfTypeFunctionName %>(document)).toBe(true);
    expect(<%= isPhStateOfTypeFunctionName %>(document.state)).toBe(true);
  });
  it("should reject a document that is not a <%= pascalCaseDocumentType %> document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(<%= assertIsPhDocumentOfTypeFunctionName %>(wrongDocumentType)).toThrow();
      expect(<%= isPhDocumentOfTypeFunctionName %>(wrongDocumentType)).toBe(false);
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
    expect(<%= isPhStateOfTypeFunctionName %>(wrongState.state)).toBe(false);
    expect(<%= assertIsPhStateOfTypeFunctionName %>(wrongState.state)).toThrow();
    expect(<%= isPhDocumentOfTypeFunctionName %>(wrongState)).toBe(false);
    expect(<%= assertIsPhDocumentOfTypeFunctionName %>(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(<%= isPhStateOfTypeFunctionName %>(wrongInitialState.state)).toBe(false);
    expect(<%= assertIsPhStateOfTypeFunctionName %>(wrongInitialState.state)).toThrow();
    expect(<%= isPhDocumentOfTypeFunctionName %>(wrongInitialState)).toBe(false);
    expect(<%= assertIsPhDocumentOfTypeFunctionName %>(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(<%= isPhDocumentOfTypeFunctionName %>(missingIdInHeader)).toBe(false);
    expect(<%= assertIsPhDocumentOfTypeFunctionName %>(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(<%= isPhDocumentOfTypeFunctionName %>(missingNameInHeader)).toBe(false);
    expect(<%= assertIsPhDocumentOfTypeFunctionName %>(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(<%= isPhDocumentOfTypeFunctionName %>(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(<%= assertIsPhDocumentOfTypeFunctionName %>(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(<%= isPhDocumentOfTypeFunctionName %>(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      <%= assertIsPhDocumentOfTypeFunctionName %>(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
