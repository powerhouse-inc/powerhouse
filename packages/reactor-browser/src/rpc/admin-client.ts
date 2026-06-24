import { fromErrorInfo } from "./error-info.js";
import type {
  CorrelationId,
  OwnerMessage,
  WorkerInspectorInfo,
  WorkerMigrationState,
} from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export interface IWorkerAdminClient {
  info(): Promise<WorkerInspectorInfo>;
  restart(): Promise<void>;
  clearStorage(): Promise<void>;
  migrate(): Promise<void>;
  getMigrationState(): WorkerMigrationState;
  subscribeMigration(callback: () => void): () => void;
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
  let migrationState: WorkerMigrationState = { status: "idle" };
  const migrationListeners = new Set<() => void>();

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
    } else if (msg.k === "migration") {
      migrationState = msg.state;
      for (const listener of migrationListeners) listener();
    }
  });

  const send = (
    method: "info" | "restart" | "clearStorage" | "migrate",
  ): Promise<unknown> => {
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
    clearStorage: () => send("clearStorage").then(() => undefined),
    migrate: () => send("migrate").then(() => undefined),
    getMigrationState: () => migrationState,
    subscribeMigration: (callback) => {
      migrationListeners.add(callback);
      return () => migrationListeners.delete(callback);
    },
  };
}
