import { fromErrorInfo } from "./error-info.js";
import type {
  CorrelationId,
  OwnerMessage,
  WorkerInspectorInfo,
} from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export interface IWorkerAdminClient {
  info(): Promise<WorkerInspectorInfo>;
  restart(): Promise<void>;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

// Worker lifecycle channel over the same transport as the reactor RPC; ids are
// prefixed so its replies don't collide with the client proxy's pending map.
export function createWorkerAdminClient(
  transport: IRpcTransport,
): IWorkerAdminClient {
  let counter = 0;
  const pending = new Map<CorrelationId, Pending>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k === "res") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.resolve(msg.value);
      }
    } else if (msg.k === "err") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.reject(fromErrorInfo(msg.error));
      }
    }
  });

  const send = (method: "info" | "restart"): Promise<unknown> => {
    const id: CorrelationId = `admin-${++counter}`;
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    transport.post({ k: "admin", id, method });
    return promise;
  };

  return {
    info: () => send("info") as Promise<WorkerInspectorInfo>,
    restart: () => send("restart").then(() => undefined),
  };
}
