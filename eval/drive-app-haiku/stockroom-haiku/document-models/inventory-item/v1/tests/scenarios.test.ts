import {
  addItem,
  adjustQuantity,
  moveItem,
  reducer,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

describe("inventory item scenarios", () => {
  it("stocks, adjusts and moves an item", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      addItem({ name: "Widget", quantity: 5, location: "A1" }),
    );
    document = reducer(document, adjustQuantity({ delta: -2 }));
    document = reducer(document, moveItem({ location: "B2" }));

    expect(document.state.global).toStrictEqual({
      name: "Widget",
      quantity: 3,
      location: "B2",
    });
    expect(document.operations.global.every((op) => !op.error)).toBe(true);
  });

  it("rejects adjust and move before the item is added", () => {
    let document = utils.createDocument();
    document = reducer(document, adjustQuantity({ delta: 1 }));
    document = reducer(document, moveItem({ location: "X" }));

    expect(document.operations.global[0].error).toBe("Item has not been added");
    expect(document.operations.global[1].error).toBe("Item has not been added");
    expect(document.state.global.quantity).toBe(0);
    expect(document.state.global.location).toBeNull();
  });

  it("rejects adding an item twice", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      addItem({ name: "Widget", quantity: 1, location: "A1" }),
    );
    document = reducer(
      document,
      addItem({ name: "Other", quantity: 9, location: "Z9" }),
    );

    expect(document.operations.global[1].error).toBe(
      "Item has already been added",
    );
    expect(document.state.global.name).toBe("Widget");
    expect(document.state.global.quantity).toBe(1);
  });

  it("rejects a quantity that would go below zero", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      addItem({ name: "Widget", quantity: 1, location: "A1" }),
    );
    document = reducer(document, adjustQuantity({ delta: -2 }));

    expect(document.operations.global[1].error).toBe(
      "Quantity cannot go below zero",
    );
    expect(document.state.global.quantity).toBe(1);
  });
});
