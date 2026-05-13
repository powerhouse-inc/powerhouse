import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type {
  IOperationIndex,
  OperationIndexEntry,
} from "../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../src/cache/operation-index-types.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { PagedResults, PagingOptions } from "../../src/shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
  ViewFilter,
} from "../../src/storage/interfaces.js";
import type { Database } from "../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncManager } from "../../src/sync/sync-manager.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import {
  createTestChannelFactory,
  createTestSyncStorage,
} from "../factories.js";

/**
 * Wraps an IOperationIndex and forces a small page limit on `find()` so the
 * test can drive `updateOutbox`'s page boundary into the middle of a
 * same-(documentId, branch, scope, timestampUtcMs) run.
 */
class SmallPageOperationIndex implements IOperationIndex {
  private readonly inner: IOperationIndex;
  private readonly pageLimit: number;

  constructor(inner: IOperationIndex, pageLimit: number) {
    this.inner = inner;
    this.pageLimit = pageLimit;
  }

  start() {
    return this.inner.start();
  }

  commit(txn: ReturnType<IOperationIndex["start"]>, signal?: AbortSignal) {
    return this.inner.commit(txn, signal);
  }

  find(
    collectionId: string,
    cursor?: number,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationIndexEntry>> {
    const limited: PagingOptions = {
      cursor: paging?.cursor ?? "0",
      limit: this.pageLimit,
    };
    return this.inner.find(collectionId, cursor, view, limited, signal);
  }

  get(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.get(documentId, view, paging, signal);
  }

  getSinceOrdinal(
    ordinal: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.getSinceOrdinal(ordinal, paging, signal);
  }

  getLatestTimestampForCollection(collectionId: string, signal?: AbortSignal) {
    return this.inner.getLatestTimestampForCollection(collectionId, signal);
  }

  getCollectionsForDocuments(documentIds: string[]) {
    return this.inner.getCollectionsForDocuments(documentIds);
  }
}

describe("Sync envelope grouping for same-timestamp runs", () => {
  let db: Kysely<Database>;
  let syncRemoteStorage: ISyncRemoteStorage;
  let syncCursorStorage: ISyncCursorStorage;
  let syncDeadLetterStorage: ISyncDeadLetterStorage;
  let eventBus: IEventBus;
  let innerIndex: IOperationIndex;
  let operationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let sentEnvelopes: SyncEnvelope[];
  let channelFactory: IChannelFactory;
  let syncManager: SyncManager;

  const PAGE_LIMIT = 3;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    syncRemoteStorage = storage.syncRemoteStorage;
    syncCursorStorage = storage.syncCursorStorage;
    syncDeadLetterStorage = storage.syncDeadLetterStorage;

    eventBus = new EventBus();

    innerIndex = new KyselyOperationIndex(db);
    operationIndex = new SmallPageOperationIndex(innerIndex, PAGE_LIMIT);

    mockReactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as any;

    sentEnvelopes = [];
    channelFactory = createTestChannelFactory(new Map(), sentEnvelopes);

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      syncRemoteStorage,
      syncCursorStorage,
      syncDeadLetterStorage,
      channelFactory,
      operationIndex,
      mockReactor,
      eventBus,
    );
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  function makeOp(
    id: string,
    index: number,
    timestampUtcMs: string,
    scope = "document",
  ): Operation {
    return {
      id,
      index,
      skip: 0,
      hash: `hash-${id}`,
      timestampUtcMs,
      action: {
        type: index === 0 ? "CREATE_DOCUMENT" : "UPDATE",
        scope,
        id: `action-${id}`,
        timestampUtcMs,
        input: {},
      },
    } as Operation;
  }

  async function seedRun(args: {
    driveId: string;
    collectionId: string;
    documentId: string;
    documentType: string;
    branch: string;
    scope: string;
    timestampUtcMs: string;
    count: number;
  }): Promise<Operation[]> {
    const ops: Operation[] = [];
    for (let i = 0; i < args.count; i++) {
      const op = makeOp(
        `op-${args.documentId}-${i}`,
        i,
        args.timestampUtcMs,
        args.scope,
      );
      ops.push(op);
      const txn = innerIndex.start();
      txn.write([
        {
          ...op,
          documentId: args.documentId,
          documentType: args.documentType,
          branch: args.branch,
          scope: args.scope,
          sourceRemote: "",
        },
      ]);
      if (i === 0) {
        txn.createCollection(args.collectionId);
        txn.addToCollection(args.collectionId, args.documentId);
      }
      await innerIndex.commit(txn);
    }
    return ops;
  }

  it("does not split a same-(docId, branch, scope, ts) run across envelopes when it straddles a page boundary", async () => {
    await syncManager.startup();

    const driveId = "test-drive-same-ts";
    const collectionId = driveCollectionId("main", driveId);
    const timestampUtcMs = "2026-01-01T00:00:00.000Z";

    const RUN_SIZE = PAGE_LIMIT * 2 + 1; // 7 ops, straddling 3 pages of 3
    const ops = await seedRun({
      driveId,
      collectionId,
      documentId: driveId,
      documentType: "powerhouse/document-drive",
      branch: "main",
      scope: "global",
      timestampUtcMs,
      count: RUN_SIZE,
    });

    const channelConfig: ChannelConfig = {
      type: "internal",
      parameters: {},
    };

    await syncManager.add("remote1", collectionId, channelConfig);

    await vi.waitFor(() => {
      expect(sentEnvelopes.length).toBeGreaterThan(0);
    });

    // Single envelope, all ops together, ordered by index.
    expect(sentEnvelopes).toHaveLength(1);
    expect(sentEnvelopes[0].operations).toHaveLength(RUN_SIZE);
    expect(sentEnvelopes[0].operations!.map((o) => o.operation.id)).toEqual(
      ops.map((op) => op.id),
    );

    const outboxCursor = await syncCursorStorage.get("remote1", "outbox");
    expect(outboxCursor.cursorOrdinal).toBeGreaterThan(0);
  });

  it("emits a single envelope per (doc, branch, scope, ts) group even when an earlier different-ts page precedes it", async () => {
    await syncManager.startup();

    const driveId = "test-drive-mixed-ts";
    const collectionId = driveCollectionId("main", driveId);
    const earlierTs = "2026-01-01T00:00:00.000Z";
    const laterTs = "2026-01-01T00:00:01.000Z";

    // First op (CREATE_DOCUMENT) at earlierTs, then a run of 5 same-ts ops at laterTs.
    const earlierOp = makeOp(`op-${driveId}-0`, 0, earlierTs, "global");
    const txn = innerIndex.start();
    txn.write([
      {
        ...earlierOp,
        documentId: driveId,
        documentType: "powerhouse/document-drive",
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    txn.createCollection(collectionId);
    txn.addToCollection(collectionId, driveId);
    await innerIndex.commit(txn);

    const laterOps: Operation[] = [];
    for (let i = 1; i <= 5; i++) {
      const op = makeOp(`op-${driveId}-${i}`, i, laterTs, "global");
      laterOps.push(op);
      const t = innerIndex.start();
      t.write([
        {
          ...op,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
        },
      ]);
      await innerIndex.commit(t);
    }

    const channelConfig: ChannelConfig = {
      type: "internal",
      parameters: {},
    };

    await syncManager.add("remote1", collectionId, channelConfig);

    await vi.waitFor(() => {
      expect(sentEnvelopes.length).toBeGreaterThan(0);
    });

    // The carry pattern preserves the trailing same-ts run as one contiguous
    // envelope. Ops with a different earlier timestamp may end up in an
    // earlier envelope, but the 5-op laterTs run must not be split.
    const laterTsEnvelopes = sentEnvelopes.filter((env) =>
      (env.operations ?? []).some(
        (o) => o.operation.timestampUtcMs === laterTs,
      ),
    );
    expect(laterTsEnvelopes).toHaveLength(1);
    expect(laterTsEnvelopes[0].operations!.map((o) => o.operation.id)).toEqual(
      laterOps.map((op) => op.id),
    );

    const allOpIds = sentEnvelopes.flatMap((env) =>
      (env.operations ?? []).map((o) => o.operation.id),
    );
    expect(allOpIds).toContain(earlierOp.id);
  });

  it("does not over-merge: separate JOB_WRITE_READY events that share a timestamp may be split across envelopes", async () => {
    await syncManager.startup();

    const driveId = "test-drive-two-events";
    const collectionId = driveCollectionId("main", driveId);
    const sharedTs = "2026-01-01T00:00:00.000Z";

    const channelConfig: ChannelConfig = {
      type: "internal",
      parameters: {},
    };

    await syncManager.add("remote1", collectionId, channelConfig, {
      documentId: [driveId],
      scope: ["global"],
      branch: "main",
    });

    // First commit + JOB_WRITE_READY.
    const op1 = makeOp(`op-${driveId}-0`, 0, sharedTs, "global");
    const txn1 = innerIndex.start();
    txn1.write([
      {
        ...op1,
        documentId: driveId,
        documentType: "powerhouse/document-drive",
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    txn1.createCollection(collectionId);
    txn1.addToCollection(collectionId, driveId);
    const ordinals1 = await innerIndex.commit(txn1);

    sentEnvelopes.length = 0;

    const operations1: OperationWithContext[] = [
      {
        operation: op1,
        context: {
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          scope: "global",
          branch: "main",
          ordinal: ordinals1[0],
        },
      },
    ];

    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations: operations1,
      jobMeta: { batchId: "batch-1", batchJobIds: ["job-1"] },
      collectionMemberships: { [driveId]: [collectionId] },
    });

    await vi.waitFor(() => {
      expect(sentEnvelopes.length).toBeGreaterThanOrEqual(1);
    });

    const firstEnvelopeCount = sentEnvelopes.length;

    // Second commit + JOB_WRITE_READY with the same timestamp.
    const op2 = makeOp(`op-${driveId}-1`, 1, sharedTs, "global");
    const txn2 = innerIndex.start();
    txn2.write([
      {
        ...op2,
        documentId: driveId,
        documentType: "powerhouse/document-drive",
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    const ordinals2 = await innerIndex.commit(txn2);

    const operations2: OperationWithContext[] = [
      {
        operation: op2,
        context: {
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          scope: "global",
          branch: "main",
          ordinal: ordinals2[0],
        },
      },
    ];

    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-2",
      operations: operations2,
      jobMeta: { batchId: "batch-2", batchJobIds: ["job-2"] },
      collectionMemberships: { [driveId]: [collectionId] },
    });

    await vi.waitFor(() => {
      expect(sentEnvelopes.length).toBeGreaterThan(firstEnvelopeCount);
    });

    // Two separate JOB_WRITE_READY events → two separate envelopes, even
    // though the timestamps match. The producer-side guarantee is only
    // about a single execute() / single page-spanning run, not across
    // independent commits that happen to share a timestamp.
    expect(sentEnvelopes.length).toBeGreaterThanOrEqual(2);
    const allOpIds = sentEnvelopes.flatMap((env) =>
      (env.operations ?? []).map((o) => o.operation.id),
    );
    expect(allOpIds).toContain(op1.id);
    expect(allOpIds).toContain(op2.id);
  });
});
