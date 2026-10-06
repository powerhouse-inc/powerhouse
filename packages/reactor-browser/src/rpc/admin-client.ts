import {
  Listeners,
  type MessageRouter,
  type WorkerInspectorInfo,
  type WorkerMigrationState,
} from "@powerhousedao/reactor/rpc";
import { RPC_DEFAULT_TIMEOUT_MS, toVoid } from "./op-channel.js";

export interface IWorkerAdminClient {
  info(): Promise<WorkerInspectorInfo>;
  restart(): Promise<void>;
  clearStorage(): Promise<void>;
  migrate(): Promise<void>;
  getMigrationState(): WorkerMigrationState;
  subscribeMigration(callback: () => void): () => void;
  /**
   * The capability-relevant facts of the construct that actually won the
   * build, reported by `ReactorHost`'s `onAdminGetBuiltConfig` hook. Opaque
   * here -- the caller knows its own shape and validates it.
   */
  getBuiltConfig(): Promise<unknown>;
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
    method: "info" | "restart" | "clearStorage" | "migrate" | "builtConfig",
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
    getBuiltConfig: () => send("builtConfig"),
  };
}
