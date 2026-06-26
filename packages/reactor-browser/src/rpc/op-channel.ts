import type { MessageRouter } from "./message-router.js";
import type { ClientMessage, OpKind } from "./protocol.js";

/** Default time a method-call RPC waits for the worker before rejecting. */
export const RPC_DEFAULT_TIMEOUT_MS = 30_000;

/** Discard a request's resolved value to satisfy a `void`-returning API. */
export function toVoid(promise: Promise<unknown>): Promise<void> {
  return promise.then(() => undefined);
}

/**
 * A single method-call RPC channel over the shared MessageRouter. Every call
 * forwards `{ k, id, method, args }` and awaits the correlated reply, so one
 * place owns the wire kind and the request timeout for sync/db/inspector ops.
 */
export interface OpChannel {
  /** Forward a method call and resolve with the worker's reply value. */
  call(method: string, args?: unknown[]): Promise<unknown>;
  /** Forward a method call whose reply value is discarded (void-returning API). */
  callVoid(method: string, args?: unknown[]): Promise<void>;
}

/** Build an {@link OpChannel} for one wire kind over the given router. */
export function opChannel(
  router: MessageRouter,
  kind: OpKind,
  timeoutMs: number = RPC_DEFAULT_TIMEOUT_MS,
): OpChannel {
  const call = (method: string, args: unknown[] = []): Promise<unknown> =>
    router.request(
      (id) => ({ k: kind, id, method, args }) as ClientMessage,
      { timeoutMs },
    );
  return {
    call,
    callVoid: (method, args) => toVoid(call(method, args)),
  };
}
