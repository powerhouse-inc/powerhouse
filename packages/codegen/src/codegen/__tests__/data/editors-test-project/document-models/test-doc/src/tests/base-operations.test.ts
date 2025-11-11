/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import {
  reducer,
  utils,
  isTestDocDocument,
  setTestId,
  SetTestIdInputSchema,
  setTestName,
  SetTestNameInputSchema,
} from "test/document-models/test-doc";

describe("BaseOperations Operations", () => {
  it("should handle setTestId operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetTestIdInputSchema());

    const updatedDocument = reducer(document, setTestId(input));

    expect(isTestDocDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_TEST_ID",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setTestName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetTestNameInputSchema());

    const updatedDocument = reducer(document, setTestName(input));

    expect(isTestDocDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_TEST_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
