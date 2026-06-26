import type { MessageRouter } from "./message-router.js";
import type { ClientMessage, OpKind } from "./protocol.js";

export const RPC_DEFAULT_TIMEOUT_MS = 30_000;

export function toVoid(promise: Promise<unknown>): Promise<void> {
  return promise.then(() => undefined);
}

export interface IOpChannel {
  call(method: string, args?: unknown[]): Promise<unknown>;
  callVoid(method: string, args?: unknown[]): Promise<void>;
}

export function opChannel(
  router: MessageRouter,
  kind: OpKind,
  timeoutMs: number = RPC_DEFAULT_TIMEOUT_MS,
): IOpChannel {
  const call = (method: string, args: unknown[] = []): Promise<unknown> =>
    router.request((id) => ({ k: kind, id, method, args }) as ClientMessage, {
      timeoutMs,
    });
  return {
    call,
    callVoid: (method, args) => toVoid(call(method, args)),
  };
}
