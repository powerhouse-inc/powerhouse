import type { Operation } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type {
  IOperationIndex,
  OperationIndexEntry,
} from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import type { PagedResults } from "../../../src/shared/types.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import type { SyncManagerConfig } from "../../../src/sync/sync-manager.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { ConnectionStateSnapshot } from "../../../src/sync/types.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

const DRIVE_ID = "drive-bound";
const COLLECTION = DriveCollectionId.forDrive(DRIVE_ID);
const STALE_WINDOW_MS = 50;
/**
 * For tests keeping a remote alive across a batch: notePoll() through
 * stalePollAgeMs runs on the real clock, so the survivor needs a window it
 * cannot age out of mid-batch.
 */
const LIVE_WINDOW_MS = 1_000;

/**
 * A client channel: it polls a remote itself, so it has no holder to report.
 *
 * Its connection state is deliberately that of a served channel nobody has
 * polled for an hour -- the two are indistinguishable by timestamp, which is
 * why only the channel's own claim to a holder may decide a removal.
 */
class HolderlessChannel extends GqlResponseChannel {
  lastHolderPollUtcMs(): number | undefined {
    return undefined;
  }

  getConnectionState(): ConnectionStateSnapshot {
    return {
      ...super.getConnectionState(),
      lastSuccessUtcMs: Date.now() - 3_600_000,
    };
  }
}

/** A served channel whose holder has already been gone for an hour. */
class AbandonedChannel extends GqlResponseChannel {
  lastHolderPollUtcMs(): number | undefined {
    return Date.now() - 3_600_000;
  }
}

/**
 * The serving channel: nothing takes an entry out of its outbox until a poll
 * acknowledges one, which is the situation the bound exists for.
 *
 * The kind is chosen by remote name rather than by the channel config's `type`,
 * as the real factories do -- they read only `parameters`, so the type string
 * that reaches SyncManager says nothing about what it was handed.
 */
function passiveChannelFactory(): IChannelFactory {
  return {
    instance(
      remoteId: string,
      remoteName: string,
      _config: unknown,
      cursorStorage: ISyncCursorStorage,
    ): IChannel {
      const logger = new ConsoleLogger(["GqlResponseChannel"]);
      if (remoteName.startsWith("client-")) {
        return new HolderlessChannel(
          logger,
          remoteId,
          remoteName,
          cursorStorage,
        );
      }
      if (remoteName.startsWith("abandoned-")) {
        return new AbandonedChannel(
          logger,
          remoteId,
          remoteName,
          cursorStorage,
        );
      }
      return new GqlResponseChannel(
        logger,
        remoteId,
        remoteName,
        cursorStorage,
      );
    },
  } as unknown as IChannelFactory;
}

function operationFor(documentId: string): Operation {
  // One second per document: emitBatches carries a page's trailing run of
  // equal timestamps into the next page, so documents that all share one are
  // never emitted until the derivation's last page.
  const seconds = Number.parseInt(documentId.replace(/\D/g, ""), 10) || 0;
  const timestampUtcMs = `2026-01-01T00:00:${String(seconds).padStart(2, "0")}.000Z`;
  return {
    id: `op-${documentId}`,
    index: 0,
    skip: 0,
    hash: `hash-${documentId}`,
    timestampUtcMs,
    action: {
      type: "CREATE_DOCUMENT",
      scope: "global",
      id: `action-${documentId}`,
      timestampUtcMs,
      input: { protocolVersions: { "base-reducer": 2 } },
    },
  };
}

describe("bounding the entries one remote's outbox holds", () => {
  let db: Kysely<Database>;
  let storage: Awaited<ReturnType<typeof createTestSyncStorage>>;
  let operationIndex: IOperationIndex;
  let eventBus: EventBus;
  let syncManager: SyncManager;
  let reactor: IReactor;
  let collectionCreated = false;

  async function writeDocument(documentId: string): Promise<void> {
    const txn = operationIndex.start();
    txn.write([
      {
        ...operationFor(documentId),
        documentId,
        documentType: "powerhouse/document-model",
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    if (!collectionCreated) {
      txn.createCollection(COLLECTION.key);
      collectionCreated = true;
    }
    txn.addToCollection(COLLECTION.key, documentId);
    await operationIndex.commit(txn);
  }

  function outboxDocumentIds(name = "remote-bound"): string[] {
    return syncManager
      .getByName(name)
      .channel.outbox.items.map((syncOp) => syncOp.documentId)
      .sort();
  }

  async function buildManager(
    config: Partial<SyncManagerConfig>,
    index: IOperationIndex = operationIndex,
  ): Promise<void> {
    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      storage.syncRemoteStorage,
      storage.syncCursorStorage,
      storage.syncDeadLetterStorage,
      passiveChannelFactory(),
      index,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      config,
    );
    await syncManager.startup();
  }

  async function rebuildManager(
    config: Partial<SyncManagerConfig>,
    index: IOperationIndex = operationIndex,
  ): Promise<void> {
    syncManager.shutdown();
    await buildManager(config, index);
  }

  function sleepPastWindow(windowMs = STALE_WINDOW_MS): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, windowMs + 100));
  }

  /**
   * Pages the index two entries at a time, holding one remote's page turn.
   *
   * A derivation only suspends between pages, so this is the seam that puts a
   * remote mid-derivation for long enough that another remote's backfill can
   * finish and drain the prunes while it is still being written to.
   */
  function holdPageTurn(
    remoteName: string,
    holdBeforePage: number,
  ): {
    index: IOperationIndex;
    reachedHold: Promise<void>;
    release: () => void;
  } {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reached!: () => void;
    const reachedHold = new Promise<void>((resolve) => (reached = resolve));

    const wrap = (
      page: PagedResults<OperationIndexEntry>,
      gated: boolean,
      turn: number,
    ): PagedResults<OperationIndexEntry> => {
      const nextPage = page.next;
      if (!nextPage) return page;
      return {
        ...page,
        next: async () => {
          if (gated && turn + 1 === holdBeforePage) {
            reached();
            await held;
          }
          return wrap(await nextPage(), gated, turn + 1);
        },
      };
    };

    const find: IOperationIndex["find"] = async (
      collectionId,
      cursor,
      view,
      paging,
      signal,
    ) =>
      wrap(
        await operationIndex.find(
          collectionId,
          cursor,
          view,
          paging ?? { cursor: "-1", limit: 2 },
          signal,
        ),
        view?.excludeSourceRemote === remoteName,
        0,
      );

    // A Proxy rather than a patched instance: the index's own `next` reaches
    // back through `this.find`, so overriding the method on the object it runs
    // against would page through the override and never advance its cursor.
    const index = new Proxy(operationIndex, {
      get(target, property, receiver) {
        if (property === "find") return find;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    return { index, reachedHold, release };
  }

  beforeEach(async () => {
    storage = await createTestSyncStorage();
    db = storage.db;
    eventBus = new EventBus();
    operationIndex = new KyselyOperationIndex(db);
    collectionCreated = false;

    reactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;

    await buildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: STALE_WINDOW_MS,
    });
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  async function addRemote(name: string, type: string): Promise<void> {
    await syncManager.add(name, COLLECTION, { type, parameters: {} });
    await vi.waitFor(() => {
      expect(
        syncManager.getByName(name).channel.outbox.items.length,
      ).toBeGreaterThan(0);
    });
  }

  async function seedAndAdd(
    count: number,
    type = "internal",
    name = "remote-bound",
  ): Promise<void> {
    for (let i = 1; i <= count; i++) {
      await writeDocument(`doc-${i}`);
    }
    await addRemote(name, type);
  }

  /**
   * Drives one batch through the aggregator, which awaits the whole
   * processCompleteBatch chain -- eviction, and the prune drain after it.
   */
  async function emitWriteReady(
    documentId: string,
    ordinal: number,
  ): Promise<void> {
    await writeDocument(documentId);
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: `job-${ordinal}`,
      operations: [
        {
          operation: operationFor(documentId),
          context: {
            documentId,
            documentType: "powerhouse/document-model",
            scope: "global",
            branch: "main",
            ordinal,
          },
        },
      ],
      jobMeta: { batchId: `batch-${ordinal}`, batchJobIds: [`job-${ordinal}`] },
      collectionMemberships: { [documentId]: [COLLECTION.key] },
    });
  }

  it("keeps the outbox at the cap when the backfill would overrun it", async () => {
    await seedAndAdd(6);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("keeps the oldest entries, so what remains runs from the cursor", async () => {
    await seedAndAdd(6);

    const items = syncManager.getByName("remote-bound").channel.outbox.items;
    const ordinals = items.map(
      (syncOp) => syncOp.operations[0].context.ordinal,
    );
    expect(Math.max(...ordinals)).toBeLessThan(4);
  });

  it("evicts without marking anything delivered", async () => {
    await seedAndAdd(6);

    for (const syncOp of syncManager.getByName("remote-bound").channel.outbox
      .items) {
      expect(syncOp.status).toBe(SyncOperationStatus.Unknown);
    }
    expect(
      syncManager.getByName("remote-bound").channel.outbox.ackOrdinal,
    ).toBe(0);
  });

  it("derives the evicted entries again once the outbox drains", async () => {
    // Nothing here is about a silent holder, and this test outlives the
    // suite's 50ms window, so it gets one it cannot age out of.
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: 300_000,
    });
    await seedAndAdd(6);

    const remote = syncManager.getByName("remote-bound");
    // What the poll resolver does when it serves an entry.
    remote.channel.notePoll();
    const served = [...remote.channel.outbox.items];
    for (const syncOp of served) {
      syncOp.executed();
    }
    remote.channel.outbox.remove(...served);
    expect(remote.channel.outbox.items).toHaveLength(0);

    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(outboxDocumentIds()).toEqual(["doc-4", "doc-5", "doc-6"]);
    });
  });

  it("removes a serving remote whose holder has stopped polling", async () => {
    // Registered as "gql", the string the old type gate exempted: what makes a
    // remote removable is that its channel serves a holder, not its config.
    await seedAndAdd(6, "gql");
    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });
  });

  it("takes the stale remote's persisted rows with it", async () => {
    await seedAndAdd(6, "polling");
    await storage.syncCursorStorage.upsert({
      remoteName: "remote-bound",
      cursorType: "outbox",
      cursorOrdinal: 2,
      lastSyncedAtUtcMs: Date.now(),
    });
    // Nothing acks in this suite, so without seeding the row the cursor
    // assertion below would pass on an already-empty table.
    expect(await storage.syncCursorStorage.list("remote-bound")).toHaveLength(
      1,
    );

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);
    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });

    expect(
      await db.selectFrom("sync_remotes").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await db
        .selectFrom("sync_cursors")
        .selectAll()
        .where("remote_name", "=", "remote-bound")
        .execute(),
    ).toHaveLength(0);
  });

  it("only evicts while the holder is still within the poll window", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: 300_000,
    });
    await seedAndAdd(6, "polling");

    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(
      syncManager.getByName("remote-bound").channel.outbox.ackOrdinal,
    ).toBe(0);
  });

  it("evicts a client remote whose own switchboard has gone quiet, however its channel was configured", async () => {
    // Registered as "polling", the string the old type gate made prunable:
    // this channel has no holder, so its silence strands nobody and its drive
    // remote must survive the outage.
    await seedAndAdd(6, "polling", "client-bound");

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds("client-bound")).toEqual([
      "doc-1",
      "doc-2",
      "doc-3",
    ]);
    expect(syncManager.getByName("client-bound").meta.name).toBe(
      "client-bound",
    );
  });

  it("keeps a remote whose holder polls between the eviction that marks it and the removal", async () => {
    await seedAndAdd(6, "gql");
    await sleepPastWindow();

    // The holder's first poll back is slow precisely because the outbox is
    // large -- the state that marks the remote -- so it lands while that
    // outbox is still being derived. Eviction removing entries is the moment
    // inside the derivation to stand it in for.
    const remote = syncManager.getByName("remote-bound");
    remote.channel.outbox.onRemoved(() => remote.channel.notePoll());

    await emitWriteReady("doc-7", 7);

    expect(syncManager.getByName("remote-bound").meta.name).toBe(
      "remote-bound",
    );
    // Held, not removed: the eviction still stands, as it does for any remote
    // inside the window.
    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("keeps a serving remote whose holder polled again", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: LIVE_WINDOW_MS,
    });
    await seedAndAdd(6, "polling");

    await sleepPastWindow(LIVE_WINDOW_MS);
    syncManager.getByName("remote-bound").channel.notePoll();
    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("removes one stale remote without disturbing another on the same collection", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: LIVE_WINDOW_MS,
    });
    await seedAndAdd(6, "polling");
    await addRemote("remote-live", "polling");

    await sleepPastWindow(LIVE_WINDOW_MS);
    syncManager.getByName("remote-live").channel.notePoll();
    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });
    expect(outboxDocumentIds("remote-live")).toEqual([
      "doc-1",
      "doc-2",
      "doc-3",
    ]);
    // The high-water mark, not the held run: the live remote derived doc-7 in
    // the same batch, so the sibling's removal did not cut its refill short.
    expect(
      syncManager.getByName("remote-live").channel.outbox.latestOrdinal,
    ).toBe(7);
  });

  it("holds a stale remote's removal until the derivation still writing to it ends", async () => {
    // The abandoned channel reports an hour of silence whatever the window is,
    // so the window here only has to be wide enough that the live remote --
    // which nothing polls either -- is never a candidate.
    for (let i = 1; i <= 8; i++) {
      await writeDocument(`doc-${i}`);
    }
    // Page 2 evicts and marks the remote; the turn to page 3 is where its own
    // derivation is caught, still holding the mailboxes it is adding to.
    const { index, reachedHold, release } = holdPageTurn("abandoned-bound", 3);
    await rebuildManager(
      {
        maxHeldOperationsPerRemote: 3,
        staleRemotePollWindowMs: 300_000,
      },
      index,
    );

    void syncManager.add("abandoned-bound", COLLECTION, {
      type: "gql",
      parameters: {},
    });
    await reachedHold;

    // The drain that the fix must defer: a second remote's backfill finishing
    // while the first is suspended between pages.
    await addRemote("remote-live", "gql");
    await vi.waitFor(() => {
      expect(outboxDocumentIds("remote-live").length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(syncManager.getByName("abandoned-bound").meta.name).toBe(
      "abandoned-bound",
    );

    release();

    // Deferred, not dropped: the derivation's own exit re-arms the drain.
    await vi.waitFor(() => {
      expect(() => syncManager.getByName("abandoned-bound")).toThrow();
    });
    expect(syncManager.getByName("remote-live").meta.name).toBe("remote-live");

    // advanceOrdinal is the derivation's last statement: waiting for it leaves
    // no page turn in flight for the teardown to reject under.
    await vi.waitFor(() => {
      expect(
        syncManager.getByName("remote-live").channel.outbox.latestOrdinal,
      ).toBe(8);
    });
  });
});
