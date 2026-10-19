// The reactor RPC on a piece child's IPC channel, bound to one request. It owns
// only `reactor-rpc` envelopes carrying that request's id.
import {
  REACTOR_RPC,
  type ReactorRpcEnvelope,
  type ReactorRequestBinding,
} from "./protocol.js";
import type { IPieceWorkerTransport } from "./transport.js";

// Structurally `IRpcTransport` from `@powerhousedao/reactor/rpc`.
export interface ReactorRpcTransport {
  post(message: never): void;
  onMessage(listener: (message: never) => void): () => void;
  close(): void;
}

// Serves ctx.reactor for one request; `open` returns the stop run when it settles.
export interface ReactorTap {
  requireReactor: ReactorRequestBinding["requireReactor"];
  open(
    transport: ReactorRpcTransport,
    request: { requestId: string; deadline: number },
  ): () => void;
}

export function isReactorRpcEnvelope(
  value: unknown,
  requestId: string,
): value is ReactorRpcEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Partial<ReactorRpcEnvelope>;
  return envelope.type === REACTOR_RPC && envelope.requestId === requestId;
}

function isRpcMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { k?: unknown }).k === "string"
  );
}

// The host's end. The child runs piece code: another request's id, or a
// message without a kind, is dropped.
export function createIpcTransport(
  worker: IPieceWorkerTransport,
  requestId: string,
): ReactorRpcTransport {
  let closed = false;
  const detachers = new Set<() => void>();
  return {
    post(message: unknown) {
      if (closed || !worker.connected) return;
      worker.send({ type: REACTOR_RPC, requestId, message });
    },
    onMessage(listener: (message: never) => void) {
      const handler = (value: unknown) => {
        if (closed || !isReactorRpcEnvelope(value, requestId)) return;
        if (!isRpcMessage(value.message)) return;
        listener(value.message as never);
      };
      worker.on("message", handler);
      const detach = () => {
        worker.off("message", handler);
        detachers.delete(detach);
      };
      detachers.add(detach);
      return detach;
    },
    close() {
      closed = true;
      for (const detach of [...detachers]) detach();
    },
  };
}
