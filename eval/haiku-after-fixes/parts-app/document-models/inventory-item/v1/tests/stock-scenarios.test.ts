import {
  addItem,
  adjustQuantity,
  moveItem,
  reducer,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

function errorAt(document: ReturnType<typeof utils.createDocument>, index: number) {
  return document.operations.global[index].error;
}

describe("InventoryItem stock scenarios", () => {
  it("runs a full conversation: add, adjust, move", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addItem({ name: "Bolt", quantity: 10, location: "A1" }));
    doc = reducer(doc, adjustQuantity({ delta: -3 }));
    doc = reducer(doc, adjustQuantity({ delta: 5 }));
    doc = reducer(doc, moveItem({ location: "B2" }));

    expect(doc.state.global).toStrictEqual({ name: "Bolt", quantity: 12, location: "B2" });
    expect(doc.operations.global.map((op) => op.error)).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it("accepts a zero starting quantity (falsy but valid)", () => {
    const doc = reducer(utils.createDocument(), addItem({ name: "Nut", quantity: 0, location: "C3" }));
    expect(errorAt(doc, 0)).toBeFalsy();
    expect(doc.state.global.quantity).toBe(0);
    expect(doc.state.global.name).toBe("Nut");
  });

  it("rejects adding an item twice and keeps the first state", () => {
    let doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 4, location: "A1" }));
    doc = reducer(doc, addItem({ name: "Other", quantity: 99, location: "Z9" }));
    expect(errorAt(doc, 1)).toBe("The item has already been added");
    expect(doc.state.global).toStrictEqual({ name: "Bolt", quantity: 4, location: "A1" });
  });

  it("rejects an empty name", () => {
    const doc = reducer(utils.createDocument(), addItem({ name: "", quantity: 1, location: "A1" }));
    expect(errorAt(doc, 0)).toBe("Item name is required");
    expect(doc.state.global.name).toBeNull();
  });

  it("rejects a negative starting quantity", () => {
    const doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: -1, location: "A1" }));
    expect(errorAt(doc, 0)).toBe("Quantity cannot be negative");
    expect(doc.state.global.name).toBeNull();
  });

  it("rejects an empty location on add", () => {
    const doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 1, location: "" }));
    expect(errorAt(doc, 0)).toBe("Location is required");
    expect(doc.state.global.name).toBeNull();
  });

  it("rejects adjusting before the item is added", () => {
    const doc = reducer(utils.createDocument(), adjustQuantity({ delta: 2 }));
    expect(errorAt(doc, 0)).toBe("Add the item before adjusting its quantity");
    expect(doc.state.global.quantity).toBe(0);
  });

  it("rejects a zero adjustment", () => {
    let doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 3, location: "A1" }));
    doc = reducer(doc, adjustQuantity({ delta: 0 }));
    expect(errorAt(doc, 1)).toBe("Adjustment must be non-zero");
    expect(doc.state.global.quantity).toBe(3);
  });

  it("rejects an adjustment that would make stock negative", () => {
    let doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 3, location: "A1" }));
    doc = reducer(doc, adjustQuantity({ delta: -4 }));
    expect(errorAt(doc, 1)).toBe("Cannot remove more than the 3 units in stock");
    expect(doc.state.global.quantity).toBe(3);
  });

  it("rejects moving before the item is added", () => {
    const doc = reducer(utils.createDocument(), moveItem({ location: "B2" }));
    expect(errorAt(doc, 0)).toBe("Add the item before moving it");
    expect(doc.state.global.location).toBeNull();
  });

  it("rejects an empty target location on move", () => {
    let doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 3, location: "A1" }));
    doc = reducer(doc, moveItem({ location: "" }));
    expect(errorAt(doc, 1)).toBe("Location is required");
    expect(doc.state.global.location).toBe("A1");
  });

  it("rejects moving to the location it is already in", () => {
    let doc = reducer(utils.createDocument(), addItem({ name: "Bolt", quantity: 3, location: "A1" }));
    doc = reducer(doc, moveItem({ location: "A1" }));
    expect(errorAt(doc, 1)).toBe("Item is already in this location");
    expect(doc.state.global.location).toBe("A1");
  });
});
