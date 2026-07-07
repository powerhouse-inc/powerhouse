import { Listeners } from "./listeners.js";
import type { MessageRouter } from "./message-router.js";
import { RPC_DEFAULT_TIMEOUT_MS, toVoid } from "./op-channel.js";
import type { WorkerInspectorInfo, WorkerMigrationState } from "./protocol.js";

export interface IWorkerAdminClient {
  info(): Promise<WorkerInspectorInfo>;
  restart(): Promise<void>;
  clearStorage(): Promise<void>;
  migrate(): Promise<void>;
  getMigrationState(): WorkerMigrationState;
  subscribeMigration(callback: () => void): () => void;
}

/** Worker lifecycle channel (info/restart/clearStorage/migrate) over the shared router. */
export function createWorkerAdminClient(
  router: MessageRouter,
): IWorkerAdminClient {
  let migrationState: WorkerMigrationState = { status: "idle" };
  const migrationListeners = new Listeners();

  router.on("migration", (msg) => {
    migrationState = msg.state;
    migrationListeners.emit();
  });

  const send = (
    method: "info" | "restart" | "clearStorage" | "migrate",
  ): Promise<unknown> =>
    router.request((id) => ({ k: "admin", id, method }), {
      timeoutMs: RPC_DEFAULT_TIMEOUT_MS,
    });

  return {
    info: () => send("info") as Promise<WorkerInspectorInfo>,
    restart: () => toVoid(send("restart")),
    clearStorage: () => toVoid(send("clearStorage")),
    migrate: () => toVoid(send("migrate")),
    getMigrationState: () => migrationState,
    subscribeMigration: (callback) => migrationListeners.add(callback),
  };
}
