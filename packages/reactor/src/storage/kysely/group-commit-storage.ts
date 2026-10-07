import { Kysely } from "kysely";
import type { IStorageFlusher } from "../storage-flush.js";
import type { IStorageHealthProvider } from "../storage-health.js";
import { StorageHealthTracker } from "../storage-health.js";
import {
  GroupCommitPGliteClient,
  type GroupCommitPGliteClientOptions,
  type GroupCommitPGliteInstance,
} from "./group-commit-pglite-client.js";
import {
  HardenedPGliteDialect,
  type HardenedPGliteDialectOptions,
} from "./pglite-dialect.js";

export type GroupCommitPGliteOptions = {
  /** Opened without `relaxedDurability`, or the flush is no barrier at all. */
  pg: GroupCommitPGliteInstance;
  /** Poisoned: unflushed writes and positions built on them are void; restart. */
  onUnrecoverable: (cause: Error) => void;
  onDiagnostic?: (message: string, error?: unknown) => void;
  dialect?: Partial<
    Pick<
      HardenedPGliteDialectOptions,
      | "acquireTimeoutMs"
      | "statementTimeoutMs"
      | "longStatementTimeoutMs"
      | "recoveryTimeoutMs"
    >
  >;
  client?: Partial<
    Pick<
      GroupCommitPGliteClientOptions,
      "flushSyncTimeoutMs" | "maxConsecutiveSyncFailures" | "closeTimeoutMs"
    >
  >;
};

/** What a host keeps of the group-commit store once the reactor is built. */
export interface IGroupCommitStorage {
  readonly health: IStorageHealthProvider;
  /** Flushes, then closes the instance; bounded. */
  close(): Promise<void>;
}

export type GroupCommitStorage<DB> = IGroupCommitStorage & {
  readonly db: Kysely<DB>;
  readonly flusher: IStorageFlusher;
};

/** One unit, so the deferral never exists without its flusher and poison path. */
export function createGroupCommitStorage<DB>(
  options: GroupCommitPGliteOptions,
): GroupCommitStorage<DB> {
  const onDiagnostic =
    options.onDiagnostic ??
    ((message: string, error?: unknown) => {
      console.error(`[group-commit-pglite] ${message}`, error);
    });
  const health = new StorageHealthTracker();
  let poisoned = false;
  const poison = (cause: Error): void => {
    if (poisoned) return;
    poisoned = true;
    health.markPoisoned();
    client.markPoisoned(cause);
    options.onUnrecoverable(cause);
  };

  const client: GroupCommitPGliteClient = new GroupCommitPGliteClient(
    options.pg,
    { ...options.client, onDiagnostic, onSyncStuck: poison },
  );
  const db = new Kysely<DB>({
    dialect: new HardenedPGliteDialect(client, {
      ...options.dialect,
      onDiagnostic,
      onPoisoned: poison,
    }),
  });

  return {
    db,
    flusher: client,
    health,
    close: () => client.close(),
  };
}
