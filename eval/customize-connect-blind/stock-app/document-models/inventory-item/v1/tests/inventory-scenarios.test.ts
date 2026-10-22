import {
  addItem,
  adjustQuantity,
  moveItem,
  reducer,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

describe("Inventory item scenarios", () => {
  it("receives, ships and moves an item through its life", () => {
    let doc = utils.createDocument();
    expect(doc.state.global).toStrictEqual({
      name: null,
      sku: null,
      quantity: 0,
      location: null,
    });

    doc = reducer(
      doc,
      addItem({
        name: "  Steel bolt M8 ",
        sku: "BOLT-M8",
        quantity: 100,
        location: "Aisle 3",
      }),
    );
    doc = reducer(doc, adjustQuantity({ delta: 20, reason: "Received PO 7" }));
    doc = reducer(doc, adjustQuantity({ delta: -120, reason: "Shipped" }));
    doc = reducer(doc, moveItem({ location: "  Aisle 7  " }));

    expect(doc.operations.global.every((op) => !op.error)).toBe(true);
    expect(doc.state.global).toStrictEqual({
      name: "Steel bolt M8",
      sku: "BOLT-M8",
      quantity: 0,
      location: "Aisle 7",
    });
  });

  it("adds an item with only the required fields", () => {
    const doc = reducer(
      utils.createDocument(),
      addItem({ name: "Washer", quantity: 0 }),
    );
    expect(doc.operations.global[0].error).toBeUndefined();
    expect(doc.state.global).toStrictEqual({
      name: "Washer",
      sku: null,
      quantity: 0,
      location: null,
    });
    // A first location can be set with MOVE_ITEM.
    const moved = reducer(doc, moveItem({ location: "Bin 1" }));
    expect(moved.state.global.location).toBe("Bin 1");
  });

  it("rejects ADD_ITEM errors without changing state", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addItem({ name: "   ", quantity: 1 }));
    doc = reducer(doc, addItem({ name: "Nut", quantity: -1 }));
    doc = reducer(doc, addItem({ name: "Nut", quantity: 5 }));
    doc = reducer(doc, addItem({ name: "Nut again", quantity: 9 }));

    expect(doc.operations.global[0].error).toBe(
      "The item name must not be empty",
    );
    expect(doc.operations.global[1].error).toBe(
      "The starting quantity must not be negative",
    );
    expect(doc.operations.global[2].error).toBeUndefined();
    expect(doc.operations.global[3].error).toBe(
      "The item has already been added",
    );
    expect(doc.state.global.name).toBe("Nut");
    expect(doc.state.global.quantity).toBe(5);
  });

  it("rejects ADJUST_QUANTITY errors without changing state", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, adjustQuantity({ delta: 3 }));
    doc = reducer(doc, addItem({ name: "Nut", quantity: 2 }));
    doc = reducer(doc, adjustQuantity({ delta: 0 }));
    doc = reducer(doc, adjustQuantity({ delta: -3, reason: "Oversell" }));

    expect(doc.operations.global[0].error).toBe(
      "Add the item before adjusting its quantity",
    );
    expect(doc.operations.global[2].error).toBe(
      "The adjustment must not be zero",
    );
    expect(doc.operations.global[3].error).toBe("Only 2 in stock");
    expect(doc.state.global.quantity).toBe(2);
  });

  it("rejects MOVE_ITEM errors without changing state", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, moveItem({ location: "Aisle 1" }));
    doc = reducer(doc, addItem({ name: "Nut", quantity: 2, location: "A1" }));
    doc = reducer(doc, moveItem({ location: "  " }));
    doc = reducer(doc, moveItem({ location: "A1 " }));

    expect(doc.operations.global[0].error).toBe(
      "Add the item before moving it",
    );
    expect(doc.operations.global[2].error).toBe(
      "The location must not be empty",
    );
    expect(doc.operations.global[3].error).toBe("The item is already at A1");
    expect(doc.state.global.location).toBe("A1");
  });
});
