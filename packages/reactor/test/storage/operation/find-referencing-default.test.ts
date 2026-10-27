import type { Operation } from "@powerhousedao/shared/document-model";
import { addModule, retract } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { findReferencing } from "../../../src/storage/find-referencing.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";

function row(index: number, action: Operation["action"], skip = 0): Operation {
  return {
    id: `op-${index}`,
    index,
    skip,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  };
}

/** A store without findReferencing, serving `rows` two at a time. */
function storeOf(rows: Operation[]): IOperationStore {
  const getSince = vi.fn(
    (
      _documentId: string,
      _scope: string,
      _branch: string,
      _revision: number,
      _filter?: unknown,
      paging?: { cursor?: string; limit?: number },
    ) => {
      const from = Number(paging?.cursor ?? "0");
      const to = from + 2;
      return Promise.resolve({
        results: rows.slice(from, to),
        options: { cursor: String(from), limit: 2 },
        nextCursor: to < rows.length ? String(to) : undefined,
      });
    },
  );
  return { getSince } as unknown as IOperationStore;
}

describe("findReferencing without the store member", () => {
  it("scans every page of the stream, rewound rows included", async () => {
    const a = addModule({ id: "a", name: "a" });
    const b = addModule({ id: "b", name: "b" });
    const store = storeOf([
      row(0, a),
      row(1, b),
      row(2, retract(a.id)),
      row(3, retract("absent")),
      row(4, addModule({ id: "c", name: "c" }), 2),
    ]);

    const found = await findReferencing(store, "doc", "global", "main", [
      a.id,
      b.id,
      "absent",
    ]);

    expect([...found].sort()).toEqual([a.id, "absent"].sort());
    expect(store.getSince).toHaveBeenCalledTimes(3);
  });

  it("reads nothing for no ids", async () => {
    const store = storeOf([row(0, retract("x"))]);

    expect(await findReferencing(store, "doc", "global", "main", [])).toEqual(
      new Set(),
    );
    expect(store.getSince).not.toHaveBeenCalled();
  });

  it("uses the store's own member when it has one", async () => {
    const own = vi.fn().mockResolvedValue(new Set(["x"]));
    const store = { findReferencing: own } as unknown as IOperationStore;

    expect(
      await findReferencing(store, "doc", "global", "main", ["x"]),
    ).toEqual(new Set(["x"]));
    expect(own).toHaveBeenCalledWith("doc", "global", "main", ["x"], undefined);
  });
});
