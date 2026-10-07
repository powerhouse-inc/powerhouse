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

/** Resolved by {@link withDeadline} when the bound won the race. */
export const TIMED_OUT = Symbol("deadline-expired");

/**
 * Races a promise that cannot be cancelled against a bound.
 *
 * The loser is abandoned rather than cancelled - a wasm call, a filesystem
 * sync and an instance teardown offer no abort - so a {@link TIMED_OUT} answer
 * means the caller will never hear about that call again and must assume it may
 * still settle later, possibly against state that has since been replaced.
 * Every caller therefore needs a generation or epoch guard on top of this, not
 * just the bound.
 */
export async function withDeadline<T>(
  pending: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMED_OUT> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    handle = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    return await Promise.race([pending, expiry]);
  } finally {
    clearTimeout(handle);
  }
}

/** Resolves after `ms`, for bounded backoff between retries. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
