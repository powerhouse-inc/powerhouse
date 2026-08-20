import type { Operation } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { SyncOperation } from "../../../src/sync/sync-operation.js";
import type { ChannelConfig, SyncEnvelope } from "../../../src/sync/types.js";
import {
  createTestChannelFactory,
  createTestSyncStorage,
} from "../../factories.js";

const DOC_ID = "doc-policied";
const DRIVE_ID = "drive-scope-ordering";

function op(
  id: string,
  index: number,
  scope: string,
  type: string,
  timestampUtcMs: string,
): Operation {
  return {
    id,
    index,
    skip: 0,
    hash: `hash-${id}`,
    timestampUtcMs,
    action: { type, scope, id: `action-${id}`, timestampUtcMs, input: {} },
  } as Operation;
}

describe("updateOutbox scope ordering", () => {
  let db: Kysely<Database>;
  let syncRemoteStorage: ISyncRemoteStorage;
  let syncCursorStorage: ISyncCursorStorage;
  let syncDeadLetterStorage: ISyncDeadLetterStorage;
  let eventBus: IEventBus;
  let operationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let sentEnvelopes: SyncEnvelope[];
  let emitted: SyncOperation[];
  let channelFactory: IChannelFactory;
  let syncManager: SyncManager;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    syncRemoteStorage = storage.syncRemoteStorage;
    syncCursorStorage = storage.syncCursorStorage;
    syncDeadLetterStorage = storage.syncDeadLetterStorage;

    eventBus = new EventBus();
    operationIndex = new KyselyOperationIndex(db);

    mockReactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as any;

    sentEnvelopes = [];
    emitted = [];
    const base = createTestChannelFactory(new Map(), sentEnvelopes);
    channelFactory = {
      instance: (...args: Parameters<IChannelFactory["instance"]>) => {
        const channel = base.instance(...args);
        channel.outbox.onAdded((syncOps) => emitted.push(...syncOps));
        return channel;
      },
    };

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      syncRemoteStorage,
      syncCursorStorage,
      syncDeadLetterStorage,
      channelFactory,
      operationIndex,
      mockReactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
    );
    await syncManager.startup();
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  // Origin history: the document is created, then a policy is initialized on it.
  // Written in causal order, in a single index transaction => single backfill page.
  async function seedPoliciedDocument(): Promise<DriveCollectionId> {
    const collectionId = DriveCollectionId.forDrive(DRIVE_ID);
    const common = {
      documentId: DOC_ID,
      documentType: "powerhouse/document-drive",
      branch: "main",
      sourceRemote: "",
    };

    const txn = operationIndex.start();
    txn.write([
      {
        ...op("op-create", 0, "document", "CREATE_DOCUMENT", "1000"),
        ...common,
        scope: "document",
      },
      {
        ...op("op-auth", 0, "auth", "INITIALIZE_AUTH", "2000"),
        ...common,
        scope: "auth",
      },
    ]);
    txn.createCollection(collectionId.key);
    txn.addToCollection(collectionId.key, DOC_ID);
    await operationIndex.commit(txn);

    return collectionId;
  }

  it("the operation index returns the creation before the auth op (ordinal order is causally safe)", async () => {
    const collectionId = await seedPoliciedDocument();

    const page = await operationIndex.find(collectionId.key, 0);

    expect(page.results.map((r) => r.scope)).toEqual(["document", "auth"]);
  });

  it("backfills a policied document creation-first", async () => {
    const collectionId = await seedPoliciedDocument();

    const channelConfig: ChannelConfig = { type: "internal", parameters: {} };
    await syncManager.add("remote1", collectionId, channelConfig);

    await vi.waitFor(() => {
      expect(emitted).toHaveLength(2);
    });

    expect(emitted.map((syncOp) => syncOp.scopes[0])).toEqual([
      "document",
      "auth",
    ]);
  });

  it("does not make a document's creation wait on its auth operation", async () => {
    const collectionId = await seedPoliciedDocument();

    const channelConfig: ChannelConfig = { type: "internal", parameters: {} };
    await syncManager.add("remote1", collectionId, channelConfig);

    await vi.waitFor(() => {
      expect(emitted).toHaveLength(2);
    });

    const creation = emitted.find((s) => s.scopes[0] === "document")!;
    const auth = emitted.find((s) => s.scopes[0] === "auth")!;

    expect(creation.jobDependencies.filter(Boolean)).not.toContain(auth.jobId);
    expect(auth.jobDependencies.filter(Boolean)).toContain(creation.jobId);
  });
});
