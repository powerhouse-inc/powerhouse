import { generateMock } from "@powerhousedao/common/utils";
import {
  isTestEmptyCodesDocument,
  reducer,
  setValue,
  SetValueInputSchema,
  utils,
} from "test/document-models/test-empty-codes/v2";
import { describe, expect, it } from "vitest";

describe("TestOperationsOperations", () => {
  it("should handle setValue operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetValueInputSchema());

    const updatedDocument = reducer(document, setValue(input));

    expect(isTestEmptyCodesDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_VALUE");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
