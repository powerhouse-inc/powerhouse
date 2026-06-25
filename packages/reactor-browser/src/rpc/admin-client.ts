import type { MessageRouter } from "./message-router.js";
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
  const migrationListeners = new Set<() => void>();

  router.on("migration", (msg) => {
    migrationState = msg.state;
    for (const listener of [...migrationListeners]) listener();
  });

  const send = (
    method: "info" | "restart" | "clearStorage" | "migrate",
  ): Promise<unknown> =>
    router.request((id) => ({ k: "admin", id, method }), { timeoutMs: 30000 });

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
