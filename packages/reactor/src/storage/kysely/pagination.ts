import type { PagedResults, PagingOptions } from "../../shared/types.js";

const DEFAULT_LIMIT = 100;

export function paginateRows<TRow, TItem>(
  rows: TRow[],
  paging: PagingOptions | undefined,
  cursorOf: (row: TRow) => number,
  toItem: (row: TRow) => TItem,
  refetch: (cursor: string, limit: number) => Promise<PagedResults<TItem>>,
): PagedResults<TItem> {
  let hasMore = false;
  let items = rows;

  if (paging?.limit && rows.length > paging.limit) {
    hasMore = true;
    items = rows.slice(0, paging.limit);
  }

  const nextCursor =
    hasMore && items.length > 0
      ? cursorOf(items[items.length - 1]).toString()
      : undefined;

  const cursor = paging?.cursor || "0";
  const limit = paging?.limit || DEFAULT_LIMIT;
  const results = items.map(toItem);

  return {
    results,
    options: { cursor, limit },
    nextCursor,
    next: hasMore ? () => refetch(nextCursor!, limit) : undefined,
  };
}
