import { generateMock } from "document-model";
import { describe, expect, it } from "vitest";
import {
  reducer,
  utils,
  isTestDocDocument,
  setTestId,
  setTestName,
  SetTestIdInputSchema,
  SetTestNameInputSchema,
} from "document-models/test-doc";

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
});
