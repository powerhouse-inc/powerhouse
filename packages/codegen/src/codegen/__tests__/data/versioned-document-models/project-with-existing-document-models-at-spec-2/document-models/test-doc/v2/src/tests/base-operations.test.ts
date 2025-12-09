import { generateMock } from "@powerhousedao/codegen";
import { describe, expect, it } from "vitest";
import {
  reducer,
  utils,
  isTestDocDocument,
  setTestId,
  setTestName,
  SetTestIdInputSchema,
  SetTestNameInputSchema,
  setTestIdButDifferent,
  SetTestIdButDifferentInputSchema,
} from "test/document-models/test-doc/v2";

describe("BaseOperationsOperations", () => {
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

  it("should handle setTestIdButDifferent operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetTestIdButDifferentInputSchema());

    const updatedDocument = reducer(document, setTestIdButDifferent(input));

    expect(isTestDocDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_TEST_ID_BUT_DIFFERENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
