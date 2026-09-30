import {
  DOCUMENT_PURGE_PROTOCOL,
  localPeerManifest,
  PEER_CAPABILITIES,
  type Operation,
  type OperationWithContext,
  type PeerManifest,
  type PurgeMarkerOperation,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { vi, type Mock } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { listPurged } from "../../../src/storage/kysely/document-purges.js";
import { KyselySyncHoldStorage } from "../../../src/storage/kysely/sync-hold-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import {
  SyncManager,
  type SyncManagerConfig,
} from "../../../src/sync/sync-manager.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import { settledAtHead } from "../../catch-up/helpers.js";
import { TestChannel } from "../../sync/channels/test-channel.js";
import {
  createTestOperation,
  createTestSyncStoragePostgres,
  type TestSyncStorage,
} from "../../factories.js";
import { indexMarker, purgeMarker, seedTombstone } from "../helpers.js";

export const DOC_TYPE = "powerhouse/document-model";
export const FILTER = { documentId: [], scope: [], branch: "main" };

/** A peer on a build from before erasure: every capability but document-purge. */
export const MANIFEST_WITHOUT_PURGE: PeerManifest = localPeerManifest(
  PEER_CAPABILITIES.filter(
    (capability) => capability.name !== DOCUMENT_PURGE_PROTOCOL,
  ),
  {},
);
export const FULL_MANIFEST: PeerManifest = localPeerManifest(
  PEER_CAPABILITIES,
  {},
);

export type MockReactor = {
  load: Mock;
  loadBatch: Mock;
  getJobStatus: Mock;
};

export type Harness = {
  storage: TestSyncStorage;
  db: Kysely<Database>;
  index: KyselyOperationIndex;
  eventBus: EventBus;
  reactor: MockReactor;
  manager: SyncManager;
  /** What each remote's channel sent, by remote name. */
  sent: Map<string, SyncEnvelope[]>;
  protocolVersionsOf: Mock;
  forgetDocument: Mock;
  cleanup: () => Promise<void>;
};

/** A SyncManager over real Postgres storage and index, with a mocked reactor. */
export async function createHarness(
  options: { config?: Partial<SyncManagerConfig>; polling?: boolean } = {},
): Promise<Harness> {
  const storage = await createTestSyncStoragePostgres();
  const db = storage.db as unknown as Kysely<Database>;
  const index = new KyselyOperationIndex(db);
  const eventBus = new EventBus();
  const reactor: MockReactor = {
    load: vi.fn(),
    loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    getJobStatus: vi.fn(),
  };
  const sent = new Map<string, SyncEnvelope[]>();
  // TestChannel writes cursors without awaiting; cleanup must outlast them.
  const pending = new Set<Promise<void>>();
  const cursors: ISyncCursorStorage = {
    list: (name) => storage.syncCursorStorage.list(name),
    get: (name, type) => storage.syncCursorStorage.get(name, type),
    remove: (name) => storage.syncCursorStorage.remove(name),
    upsert: (cursor) => {
      const write = storage.syncCursorStorage.upsert(cursor);
      const tracked = write
        .catch(() => {})
        .finally(() => pending.delete(tracked));
      pending.add(tracked);
      return write;
    },
  };
  const factory = {
    instance: (remoteId: string, remoteName: string, _config: unknown) => {
      if (options.polling) {
        return new GqlResponseChannel(
          new ConsoleLogger(["GqlResponseChannel"]),
          remoteId,
          remoteName,
          cursors,
        );
      }
      const envelopes: SyncEnvelope[] = [];
      sent.set(remoteName, envelopes);
      return new TestChannel(remoteId, remoteName, cursors, (e) => {
        envelopes.push(e);
      });
    },
  } as unknown as IChannelFactory;
  const protocolVersionsOf = vi.fn().mockResolvedValue({});
  const forgetDocument = vi.fn();

  const manager = new SyncManager(
    new ConsoleLogger(["SyncManager"]),
    storage.syncRemoteStorage,
    cursors,
    storage.syncDeadLetterStorage,
    factory,
    index,
    reactor as unknown as IReactor,
    eventBus,
    DEFAULT_DRIVE_CONTAINER_TYPES,
    settledAtHead(),
    options.config ?? {},
    {
      capabilities: PEER_CAPABILITIES,
      flags: {},
      protocolVersionsOf,
      forgetDocument,
    },
    new KyselySyncHoldStorage(storage.db),
    { listPurged: () => listPurged(db) },
  );

  return {
    storage,
    db,
    index,
    eventBus,
    reactor,
    manager,
    sent,
    protocolVersionsOf,
    forgetDocument,
    cleanup: async () => {
      await manager.shutdown().completed;
      await Promise.all([...pending]);
      await storage.cleanup();
    },
  };
}

export function withContext(
  operation: Operation,
  documentId: string,
  ordinal: number,
  scope = "global",
): OperationWithContext {
  return {
    operation,
    context: {
      documentId,
      documentType: DOC_TYPE,
      scope,
      branch: "main",
      ordinal,
    },
  };
}

/** Indexes one ordinary operation of `documentId`, joining `joins`. */
export async function indexOperation(
  index: KyselyOperationIndex,
  documentId: string,
  options: {
    joins?: string[];
    leaves?: string[];
    operation?: Operation;
    scope?: string;
  } = {},
): Promise<OperationWithContext> {
  const operation =
    options.operation ??
    createTestOperation(documentId, {
      index: Math.floor(Math.random() * 1_000_000),
    });
  const txn = index.start();
  txn.write([
    {
      ...operation,
      documentId,
      documentType: DOC_TYPE,
      scope: options.scope ?? "global",
      branch: "main",
      sourceRemote: "",
    },
  ]);
  for (const collectionId of options.joins ?? []) {
    txn.createCollection(collectionId);
    txn.addToCollection(collectionId, documentId);
  }
  for (const collectionId of options.leaves ?? []) {
    txn.removeFromCollection(collectionId, documentId);
  }
  const [ordinal] = await index.commit(txn);
  return withContext(operation, documentId, ordinal, options.scope);
}

/** The id's rows as a purge leaves them: the marker, memberships reopened. */
export async function purgeInIndex(
  db: Kysely<Database>,
  index: KyselyOperationIndex,
  documentId: string,
): Promise<{ marker: PurgeMarkerOperation; entry: OperationWithContext }> {
  await db
    .deleteFrom("operation_index_operations")
    .where("documentId", "=", documentId)
    .execute();
  await db
    .deleteFrom("sync_holds")
    .where("document_id", "=", documentId)
    .execute();
  await db
    .deleteFrom("sync_dead_letters")
    .where("document_id", "=", documentId)
    .execute();
  const marker = purgeMarker(documentId);
  const ordinal = await indexMarker(index, marker, { reopenMemberships: db });
  await seedTombstone(db, documentId, ordinal);
  return {
    marker,
    entry: withContext(marker, documentId, ordinal, "document"),
  };
}

/** The purge job's write-ready event, as the executor emits it. */
export async function emitWriteReady(
  eventBus: EventBus,
  entries: OperationWithContext[],
  collectionMemberships: Record<string, string[]>,
): Promise<void> {
  const jobId = crypto.randomUUID();
  await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
    jobId,
    operations: entries,
    jobMeta: { batchId: `auto-${jobId}`, batchJobIds: [jobId] },
    collectionMemberships,
  });
}

/** Every operation a remote was sent, in order. */
export function sentOperations(
  harness: Harness,
  remoteName: string,
): OperationWithContext[] {
  return (harness.sent.get(remoteName) ?? []).flatMap(
    (envelope) => envelope.operations ?? [],
  );
}

export const quiesce = () => new Promise((resolve) => setTimeout(resolve, 200));
