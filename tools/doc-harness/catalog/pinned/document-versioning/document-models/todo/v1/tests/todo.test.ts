import { generateMock } from "document-model/mock";
import {
  addItem,
  AddItemInputSchema,
  checkItem,
  CheckItemInputSchema,
  isTodoDocument,
  reducer,
  utils,
} from "document-models/todo/v1";
import { describe, expect, it } from "vitest";

describe("TodoOperations", () => {
  it("should handle addItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddItemInputSchema());

    const updatedDocument = reducer(document, addItem(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_ITEM");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle checkItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(CheckItemInputSchema());

    const updatedDocument = reducer(document, checkItem(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("CHECK_ITEM");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
