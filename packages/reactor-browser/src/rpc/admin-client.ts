import type {
  OwnerMessage,
  WorkerInspectorInfo,
  WorkerMigrationState,
} from "./protocol.js";
import { RpcCorrelator } from "./rpc-correlator.js";
import type { IRpcTransport } from "./transport.js";

export interface IWorkerAdminClient {
  info(): Promise<WorkerInspectorInfo>;
  restart(): Promise<void>;
  clearStorage(): Promise<void>;
  migrate(): Promise<void>;
  getMigrationState(): WorkerMigrationState;
  subscribeMigration(callback: () => void): () => void;
}

// Worker lifecycle channel over the same transport as the reactor RPC; ids are
// prefixed so its replies don't collide with the client proxy's pending map.
export function createWorkerAdminClient(
  transport: IRpcTransport,
): IWorkerAdminClient {
  let migrationState: WorkerMigrationState = { status: "idle" };
  const migrationListeners = new Set<() => void>();
  const correlator = new RpcCorrelator(transport, {
    prefix: "admin-",
    timeoutMs: 30000,
    label: "admin-op",
  });

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (correlator.handleMessage(msg)) {
      return;
    }
    if (msg.k === "migration") {
      migrationState = msg.state;
      for (const listener of [...migrationListeners]) listener();
    }
  });

  const send = (
    method: "info" | "restart" | "clearStorage" | "migrate",
  ): Promise<unknown> =>
    correlator.request((id) => ({ k: "admin", id, method }));

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
