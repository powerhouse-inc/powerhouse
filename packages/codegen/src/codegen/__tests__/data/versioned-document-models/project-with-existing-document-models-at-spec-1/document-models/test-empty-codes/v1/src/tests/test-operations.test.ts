/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import {
  reducer,
  utils,
  isTestEmptyCodesDocument,
  setValue,
  SetValueInputSchema,
} from "test/document-models/test-empty-codes/v1";

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
