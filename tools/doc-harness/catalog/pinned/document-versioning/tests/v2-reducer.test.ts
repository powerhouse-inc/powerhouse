import { describe, expect, it } from "vitest";
import { checkItem } from "document-models/todo/v1";
import {
  addItem,
  createTodoDocument,
  reducer,
  setPriority,
  setStatus,
} from "document-models/todo/v2";

describe("todo v2 reducer", () => {
  it("appends items with default status TODO and priority 0", () => {
    let doc = createTodoDocument();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));

    expect(doc.state.global.items).toEqual([
      { id: "a", title: "First", status: "TODO", priority: 0 },
    ]);
  });

  it("sets status and priority on existing items", () => {
    let doc = createTodoDocument();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));
    doc = reducer(doc, setStatus({ id: "a", status: "IN_PROGRESS" }));
    doc = reducer(doc, setPriority({ id: "a", priority: 3 }));

    expect(doc.state.global.items[0]).toEqual({
      id: "a",
      title: "First",
      status: "IN_PROGRESS",
      priority: 3,
    });
  });

  it("still interprets the retired v1 CHECK_ITEM operation", () => {
    // Histories recorded under v1 replay through the latest reducer, so the
    // v2 reducer keeps a legacy handler mapping checked to a status.
    let doc = createTodoDocument();
    doc = reducer(doc, addItem({ id: "a", title: "First" }));
    doc = reducer(doc, checkItem({ id: "a", checked: true }));
    expect(doc.state.global.items[0].status).toBe("DONE");

    doc = reducer(doc, checkItem({ id: "a", checked: false }));
    expect(doc.state.global.items[0].status).toBe("TODO");
  });
});
