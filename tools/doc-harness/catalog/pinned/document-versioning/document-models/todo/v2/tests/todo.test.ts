import { generateMock } from "document-model/mock";
import {
  addItem,
  AddItemInputSchema,
  checkItem,
  CheckItemInputSchema,
  isTodoDocument,
  reducer,
  setPriority,
  SetPriorityInputSchema,
  setStatus,
  SetStatusInputSchema,
  utils,
} from "document-models/todo/v2";
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

  it("should handle setStatus operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetStatusInputSchema());

    const updatedDocument = reducer(document, setStatus(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_STATUS");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setPriority operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetPriorityInputSchema());

    const updatedDocument = reducer(document, setPriority(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PRIORITY",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
