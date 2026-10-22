import {
  addItem,
  adjustQuantity,
  moveItem,
  reducer,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

describe("inventory item scenario", () => {
  it("adds, adjusts and moves an item", () => {
    let doc = utils.createDocument();
    expect(doc.state.global).toEqual({ name: null, quantity: 0, location: null });

    doc = reducer(doc, addItem({ name: "Bolts", quantity: 10, location: "A1" }));
    doc = reducer(doc, adjustQuantity({ delta: 5 }));
    doc = reducer(doc, adjustQuantity({ delta: -15 }));
    doc = reducer(doc, moveItem({ location: "B2" }));

    expect(doc.operations.global.every((op) => !op.error)).toBe(true);
    expect(doc.state.global).toEqual({ name: "Bolts", quantity: 0, location: "B2" });
  });

  it("records errors without changing state", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addItem({ name: "Nuts", quantity: -1, location: "A1" }));
    expect(doc.operations.global[0].error).toBe("Quantity cannot be negative");
    expect(doc.state.global.name).toBeNull();

    doc = reducer(doc, addItem({ name: "Nuts", quantity: 2, location: "A1" }));
    doc = reducer(doc, adjustQuantity({ delta: -3 }));
    expect(doc.operations.global[2].error).toBe(
      "Cannot remove 3; only 2 on hand",
    );
    expect(doc.state.global.quantity).toBe(2);

    doc = reducer(doc, moveItem({ location: "   " }));
    expect(doc.operations.global[3].error).toBe("Location cannot be empty");
    expect(doc.state.global.location).toBe("A1");
  });
});
