import {
  addStock,
  adjustQuantity,
  moveItem,
  reducer,
  setItemDetails,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";

const at = "2026-01-01T00:00:00.000Z";

describe("inventory item scenario", () => {
  it("receives, counts and moves stock", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setItemDetails({ name: "Bolt M6", sku: "B-M6" }));
    doc = reducer(doc, moveItem({ id: "m1", location: "Shelf A", at }));
    doc = reducer(doc, addStock({ id: "a1", amount: 10, at }));
    doc = reducer(
      doc,
      adjustQuantity({ id: "j1", delta: -3, reason: "count", at }),
    );
    doc = reducer(doc, adjustQuantity({ id: "j2", delta: 1, at }));
    doc = reducer(doc, setItemDetails({}));
    doc = reducer(doc, setItemDetails({ name: null, sku: null }));

    const s = doc.state.global;
    expect(s.name).toBeNull();
    expect(s.sku).toBeNull();
    expect(s.quantity).toBe(8);
    expect(s.location).toBe("Shelf A");
    expect(s.history.map((h) => h.kind)).toEqual([
      "MOVE",
      "ADD",
      "ADJUST",
      "ADJUST",
    ]);
    expect(s.history[2].reason).toBe("count");
    expect(s.history[3].reason).toBeNull();
    expect(doc.operations.global.every((o) => !o.error)).toBe(true);
  });

  it("records stock added before a location is set without one", () => {
    const doc = reducer(
      utils.createDocument(),
      addStock({ id: "a", amount: 1, at }),
    );
    expect(doc.state.global.history[0].location).toBeNull();
  });

  it("rejects bad input without changing state", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addStock({ id: "a1", amount: 0, at }));
    expect(doc.operations.global[0].error).toBe("Amount must be positive");
    doc = reducer(doc, adjustQuantity({ id: "j1", delta: -1, at }));
    expect(doc.operations.global[1].error).toBe(
      "Quantity cannot go below zero",
    );
    doc = reducer(doc, moveItem({ id: "m1", location: "A", at }));
    doc = reducer(doc, moveItem({ id: "m2", location: "A", at }));
    expect(doc.operations.global[3].error).toBe("The item is already there");
    expect(doc.state.global.quantity).toBe(0);
    expect(doc.state.global.history).toHaveLength(1);
  });
});
