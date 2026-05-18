import { describe, expect, it, vi } from "vitest";
import { paginateRows } from "../../src/storage/kysely/pagination.js";
import type { PagedResults } from "../../src/shared/types.js";

type Row = { index: number; value: string };

const cursorOf = (row: Row): number => row.index;
const toItem = (row: Row): string => row.value;

describe("paginateRows", () => {
  it("returns all rows with no next when paging is omitted", () => {
    const rows: Row[] = [
      { index: 1, value: "a" },
      { index: 2, value: "b" },
    ];
    const refetch = vi.fn();
    const result = paginateRows(rows, undefined, cursorOf, toItem, refetch);

    expect(result.results).toEqual(["a", "b"]);
    expect(result.options).toEqual({ cursor: "0", limit: 100 });
    expect(result.nextCursor).toBeUndefined();
    expect(result.next).toBeUndefined();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("returns hasMore=false when row count fits within the limit", () => {
    const rows: Row[] = [
      { index: 1, value: "a" },
      { index: 2, value: "b" },
    ];
    const refetch = vi.fn();
    const result = paginateRows(
      rows,
      { cursor: "0", limit: 5 },
      cursorOf,
      toItem,
      refetch,
    );

    expect(result.results).toEqual(["a", "b"]);
    expect(result.options).toEqual({ cursor: "0", limit: 5 });
    expect(result.nextCursor).toBeUndefined();
    expect(result.next).toBeUndefined();
  });

  it("returns nextCursor and next thunk when there are more rows", async () => {
    const rows: Row[] = [
      { index: 1, value: "a" },
      { index: 2, value: "b" },
      { index: 3, value: "c" },
    ];
    const followUp: PagedResults<string> = {
      results: ["d"],
      options: { cursor: "2", limit: 2 },
      nextCursor: undefined,
    };
    const refetch = vi.fn().mockResolvedValue(followUp);

    const result = paginateRows(
      rows,
      { cursor: "0", limit: 2 },
      cursorOf,
      toItem,
      refetch,
    );

    expect(result.results).toEqual(["a", "b"]);
    expect(result.nextCursor).toBe("2");
    expect(result.next).toBeDefined();

    const second = await result.next!();
    expect(refetch).toHaveBeenCalledWith("2", 2);
    expect(second).toBe(followUp);
  });

  it("preserves caller-provided cursor in the options echo", () => {
    const refetch = vi.fn();
    const result = paginateRows(
      [],
      { cursor: "abc", limit: 10 },
      cursorOf,
      toItem,
      refetch,
    );
    expect(result.options).toEqual({ cursor: "abc", limit: 10 });
    expect(result.results).toEqual([]);
    expect(result.nextCursor).toBeUndefined();
  });
});
