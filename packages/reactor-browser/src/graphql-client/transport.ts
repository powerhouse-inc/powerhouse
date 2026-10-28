/** The `fetch` a client's HTTP requests go through. */
export type GraphQLFetch = typeof globalThis.fetch;

/** The global `fetch`, read per call so a later replacement is honoured. */
export const globalFetch: GraphQLFetch = (input, init) =>
  globalThis.fetch(input, init);

/** Bounds each request, headers through body; rejects with a `TimeoutError`. */
export function withRequestDeadline(
  timeoutMs: number,
  inner: GraphQLFetch = globalFetch,
): GraphQLFetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline;
    return inner(input, { ...init, signal });
  };
}

/** Whether a request failed at its deadline rather than by its caller's abort. */
export function isDeadlineError(error: unknown): boolean {
  // A DOMException, which not every engine's Error.isError admits.
  return (error as { name?: unknown } | null)?.name === "TimeoutError";
}
