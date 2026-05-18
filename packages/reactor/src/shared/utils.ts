import type { PagingOptions, ViewFilter } from "./types.js";

export function matchesScope(view: ViewFilter = {}, scope: string): boolean {
  if (view.scopes) {
    return view.scopes.includes(scope);
  }

  // if there are no scopes specified, we match all scopes
  return true;
}

export function yieldToMain(): Promise<void> {
  const s = (globalThis as Record<string, unknown>).scheduler as
    | { yield?: () => Promise<void> }
    | undefined;
  if (s?.yield) {
    return s.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const defaultAbortError = (): Error => new Error("Operation aborted");

export function throwIfAborted(
  signal: AbortSignal | undefined,
  makeError: () => Error = defaultAbortError,
): void {
  if (signal?.aborted) {
    throw makeError();
  }
}

export type ParsedPaging = {
  offset: number;
  limit: number;
};

/**
 * Validates PagingOptions and returns a normalized offset and limit.
 * Throws if the cursor is not empty and not a non-negative integer, or if
 * limit is less than 1. When `paging` is undefined, returns offset 0 and
 * the caller-supplied `defaultLimit`.
 */
export function parsePagingOptions(
  paging: PagingOptions | undefined,
  defaultLimit: number,
): ParsedPaging {
  if (paging === undefined) {
    return { offset: 0, limit: defaultLimit };
  }
  if (!Number.isInteger(paging.limit) || paging.limit < 1) {
    throw new Error(
      `Invalid paging limit: ${String(paging.limit)} (must be an integer >= 1)`,
    );
  }
  if (paging.cursor === "") {
    return { offset: 0, limit: paging.limit };
  }
  const parsed = Number(paging.cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Invalid paging cursor: ${JSON.stringify(paging.cursor)} (must be empty or a non-negative integer)`,
    );
  }
  return { offset: parsed, limit: paging.limit };
}
