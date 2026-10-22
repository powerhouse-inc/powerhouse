import { generateMock } from "document-model/mock";
import {
  addItem,
  AddItemInputSchema,
  adjustQuantity,
  AdjustQuantityInputSchema,
  isInventoryItemDocument,
  moveItem,
  MoveItemInputSchema,
  reducer,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

describe("InventoryOperations", () => {
  it("should handle addItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddItemInputSchema());

    const updatedDocument = reducer(document, addItem(input));

    expect(isInventoryItemDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_ITEM");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle adjustQuantity operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AdjustQuantityInputSchema());

    const updatedDocument = reducer(document, adjustQuantity(input));

    expect(isInventoryItemDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADJUST_QUANTITY",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle moveItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(MoveItemInputSchema());

    const updatedDocument = reducer(document, moveItem(input));

    expect(isInventoryItemDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("MOVE_ITEM");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
