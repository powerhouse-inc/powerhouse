import { generateMock } from "document-model/mock";
import {
  addStock,
  AddStockInputSchema,
  adjustQuantity,
  AdjustQuantityInputSchema,
  isInventoryItemDocument,
  moveItem,
  MoveItemInputSchema,
  reducer,
  setItemDetails,
  SetItemDetailsInputSchema,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

describe("StockOperations", () => {
  it("should handle setItemDetails operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetItemDetailsInputSchema());

    const updatedDocument = reducer(document, setItemDetails(input));

    expect(isInventoryItemDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_ITEM_DETAILS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle addStock operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddStockInputSchema(), {
      at: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, addStock(input));

    expect(isInventoryItemDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_STOCK");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle adjustQuantity operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AdjustQuantityInputSchema(), {
      at: "2024-01-01T00:00:00.000Z",
    });

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
    const input = generateMock(MoveItemInputSchema(), {
      at: "2024-01-01T00:00:00.000Z",
    });

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
