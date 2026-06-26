import { toErrorInfo } from "./error-info.js";
import { responseErrorKind } from "./protocol.js";
import type { ClientMessage, CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export interface IHostResponder {
  ok(id: CorrelationId, value?: unknown): void;
  err(id: CorrelationId, error: unknown): void;
  errForKind(message: ClientMessage, error: unknown): void;
  run(
    id: CorrelationId,
    body: () => Promise<unknown>,
    mapOk?: (value: unknown) => unknown,
  ): Promise<void>;
}

const defaultOk = (): unknown => ({ ok: true });

export function hostResponder(transport: IRpcTransport): IHostResponder {
  const ok = (id: CorrelationId, value: unknown = { ok: true }): void => {
    transport.post({ k: "res", id, value });
  };
  const err = (id: CorrelationId, error: unknown): void => {
    transport.post({ k: "err", id, error: toErrorInfo(error) });
  };
  return {
    ok,
    err,
    errForKind(message, error) {
      if (!("id" in message)) {
        return;
      }
      transport.post({
        k: responseErrorKind(message.k),
        id: message.id,
        error: toErrorInfo(error),
      } as OwnerMessage);
    },
    async run(id, body, mapOk = defaultOk) {
      try {
        ok(id, mapOk(await body()));
      } catch (error) {
        err(id, error);
      }
    },
  };
}
