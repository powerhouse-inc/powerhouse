/** The `fetch` a client's HTTP requests go through. */
export type GraphQLFetch = typeof globalThis.fetch;

/** The global `fetch`, read per call so a later replacement is honoured. */
export const globalFetch: GraphQLFetch = (input, init) =>
  globalThis.fetch(input, init);

/**
 * Whether `fetch` here is Node's (undici), which resends a request answered
 * 421 and can fail the resend of a buffered body. A page, Electron's renderer
 * included, has a `document`.
 */
export function isNodeFetch(): boolean {
  const scope = globalThis as {
    process?: { versions?: { node?: unknown } };
    document?: unknown;
  };
  return (
    typeof scope.process?.versions?.node === "string" &&
    scope.document === undefined
  );
}

/**
 * Sends a string body as a stream, which fetch never resends, so a 421 comes
 * back as itself. Browsers keep buffered bodies: Chrome streams an upload only
 * over HTTP/2.
 */
export function withStreamedBodies(
  inner: GraphQLFetch = globalFetch,
): GraphQLFetch {
  return (input, init) => {
    const body = init?.body;
    if (typeof body !== "string") {
      return inner(input, init);
    }
    return inner(input, {
      ...init,
      body: new Blob([body]).stream(),
      duplex: "half",
    } as RequestInit);
  };
}

const streamedGlobalFetch = withStreamedBodies(globalFetch);

/** A Switchboard backend's default transport: streamed bodies under Node only. */
export const switchboardFetch: GraphQLFetch = (input, init) =>
  isNodeFetch() ? streamedGlobalFetch(input, init) : globalFetch(input, init);

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
