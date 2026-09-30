import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISettledWatermark } from "../../../src/catch-up/types.js";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { KyselySyncHoldStorage } from "../../../src/storage/kysely/sync-hold-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { supportsDeliveryTracking } from "../../../src/sync/delivery-tracking.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import type { RemoteFilter } from "../../../src/sync/types.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import type { Kysely } from "kysely";
import {
  createTestOperation,
  createTestSyncStoragePostgres,
} from "../../factories.js";
import {
  createHarness,
  DOC_TYPE,
  FILTER,
  FULL_MANIFEST,
  purgeInIndex,
  type Harness,
} from "./harness.js";

const DOC = "erased-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const COL_B = DriveCollectionId.forDrive("drive-b");
const COL_C = DriveCollectionId.forDrive("drive-c");
const CONFIG = { type: "internal", parameters: {} };
const ANY: RemoteFilter = FILTER;

type ControlledWatermark = ISettledWatermark & { advance(to: number): void };

function controlledWatermark(): ControlledWatermark {
  let through = 0;
  const listeners = new Set<(settledThrough: number) => void>();
  return {
    get settledThrough() {
      return through;
    },
    refresh: () => Promise.resolve(through),
    onAdvance: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => ({ head: through, settledThrough: through, waitingOn: [] }),
    advance(to: number) {
      through = to;
      for (const listener of listeners) listener(to);
    },
  };
}

async function indexOp(
  index: KyselyOperationIndex,
  options: {
    joins?: DriveCollectionId[];
    leaves?: DriveCollectionId[];
    scope?: string;
    sourceRemote?: string;
  } = {},
): Promise<number> {
  const operation = createTestOperation(DOC, {
    index: Math.floor(Math.random() * 1_000_000),
  });
  const txn = index.start();
  txn.write([
    {
      ...operation,
      documentId: DOC,
      documentType: DOC_TYPE,
      scope: options.scope ?? "global",
      branch: "main",
      sourceRemote: options.sourceRemote ?? "",
    },
  ]);
  for (const collection of options.joins ?? []) {
    txn.createCollection(collection.key);
    txn.addToCollection(collection.key, DOC);
  }
  for (const collection of options.leaves ?? []) {
    txn.removeFromCollection(collection.key, DOC);
  }
  const [ordinal] = await index.commit(txn);
  return ordinal;
}

describe("pendingDelivery [Postgres]", () => {
  let harness: Harness;
  let watermark: ControlledWatermark;

  beforeEach(async () => {
    watermark = controlledWatermark();
    harness = await createHarness({ watermark });
    await harness.manager.startup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  const add = (name: string, collection = COL_A, filter = ANY) =>
    harness.manager.add(
      name,
      collection,
      CONFIG,
      filter,
      {},
      name,
      FULL_MANIFEST,
    );

  const pending = (ordinal: number) =>
    harness.manager.pendingDelivery(DOC, ordinal);

  const outboxCursor = async (name: string) =>
    (await harness.storage.syncCursorStorage.get(name, "outbox")).cursorOrdinal;

  it("is a delivery-tracking capability", () => {
    expect(supportsDeliveryTracking(harness.manager)).toBe(true);
    expect(supportsDeliveryTracking({})).toBe(false);
    expect(supportsDeliveryTracking(null)).toBe(false);
  });

  it("waits while a remote is owed and is empty once it acknowledges", async () => {
    await add("a");
    const ordinal = await indexOp(harness.index, { joins: [COL_A] });

    expect(await pending(ordinal)).toEqual([
      { remote: "a", state: "connected" },
    ]);

    watermark.advance(ordinal);
    await vi.waitFor(async () => {
      expect(await outboxCursor("a")).toBeGreaterThanOrEqual(ordinal);
    });
    expect(await pending(ordinal)).toEqual([]);
  });

  it("does not wait on the ordinal's source remote", async () => {
    await add("a");
    await add("b");
    const ordinal = await indexOp(harness.index, {
      joins: [COL_A],
      sourceRemote: "a",
    });

    expect(await pending(ordinal)).toEqual([
      { remote: "b", state: "connected" },
    ]);
  });

  it("reports a held remote held whatever its cursor", async () => {
    await add("a");
    await add("b");
    const ordinal = await indexOp(harness.index, { joins: [COL_A] });
    for (const name of ["a", "b"]) {
      await harness.storage.syncCursorStorage.upsert({
        remoteName: name,
        cursorType: "outbox",
        cursorOrdinal: ordinal + 10,
      });
    }
    const holds = new KyselySyncHoldStorage(harness.storage.db);
    await holds.upsert({
      remoteName: "a",
      documentId: DOC,
      branch: "main",
      protocol: "document-purge",
      version: 1,
      heldAtUtcMs: Date.now(),
    });

    expect(await pending(ordinal)).toEqual([{ remote: "a", state: "held" }]);

    await harness.storage.syncCursorStorage.upsert({
      remoteName: "a",
      cursorType: "outbox",
      cursorOrdinal: 0,
    });
    expect(await pending(ordinal)).toEqual([{ remote: "a", state: "held" }]);
  });

  it("does not owe a remote whose filter excludes the document", async () => {
    await add("other-doc", COL_A, { ...ANY, documentId: ["another"] });
    await add("other-scope", COL_A, { ...ANY, scope: ["document"] });
    await add("other-branch", COL_A, { ...ANY, branch: "draft" });
    await add("matching", COL_A, { ...ANY, documentId: [DOC] });
    const ordinal = await indexOp(harness.index, { joins: [COL_A] });

    expect(await pending(ordinal)).toEqual([
      { remote: "matching", state: "connected" },
    ]);
  });

  it("does not owe a remote of a collection the document left before", async () => {
    await add("a", COL_A);
    await add("b", COL_B);
    await indexOp(harness.index, { joins: [COL_A, COL_B] });
    const leftAt = await indexOp(harness.index, { leaves: [COL_A] });
    const ordinal = await indexOp(harness.index);

    const membership = await (harness.db as Kysely<Database>)
      .selectFrom("document_collections")
      .select("leftOrdinal")
      .where("documentId", "=", DOC)
      .where("collectionId", "=", COL_A.key)
      .executeTakeFirstOrThrow();
    expect(Number(membership.leftOrdinal)).toBe(leftAt);

    expect(await pending(ordinal)).toEqual([
      { remote: "b", state: "connected" },
    ]);
  });

  it("owes a remote added after the ordinal, at cursor 0", async () => {
    const ordinal = await indexOp(harness.index, { joins: [COL_A] });
    await add("late");

    expect(await outboxCursor("late")).toBe(0);
    expect(await pending(ordinal)).toEqual([
      { remote: "late", state: "connected" },
    ]);

    watermark.advance(ordinal);
    await vi.waitFor(async () => {
      expect(await pending(ordinal)).toEqual([]);
    });
  });

  it("owes the marker to every reopened membership until acknowledged", async () => {
    await add("a", COL_A);
    await add("b", COL_B);
    await add("c", COL_C);
    await indexOp(harness.index, { joins: [COL_A, COL_B] });
    const leftAt = await indexOp(harness.index, { leaves: [COL_A] });
    watermark.advance(leftAt);
    await vi.waitFor(async () => {
      expect(await outboxCursor("b")).toBeGreaterThanOrEqual(leftAt);
    });

    const { entry } = await purgeInIndex(harness.db, harness.index, DOC);
    const markerOrdinal = entry.context.ordinal;

    expect(await pending(markerOrdinal)).toEqual([
      { remote: "a", state: "connected" },
      { remote: "b", state: "connected" },
    ]);

    watermark.advance(markerOrdinal);
    await vi.waitFor(async () => {
      expect(await pending(markerOrdinal)).toEqual([]);
    });
  });

  it("refuses an ordinal holding no row of the document", async () => {
    await add("a");
    const ordinal = await indexOp(harness.index, { joins: [COL_A] });

    await expect(
      harness.manager.pendingDelivery("another", ordinal),
    ).rejects.toThrow(/No operation of document another/);
    await expect(pending(ordinal + 100)).rejects.toThrow(/No operation/);
  });
});

describe("SyncBuilder delivery tracking [Postgres]", () => {
  it("builds a sync manager that tracks delivery", async () => {
    const storage = await createTestSyncStoragePostgres();
    const db = storage.db as unknown as Kysely<Database>;
    const index = new KyselyOperationIndex(db);
    const manager = new SyncBuilder()
      .withChannelFactory({ instance: vi.fn() } as unknown as IChannelFactory)
      .build(
        {} as IReactor,
        new ConsoleLogger(["SyncManager"]),
        index,
        new EventBus(),
        db,
        DEFAULT_DRIVE_CONTAINER_TYPES,
        controlledWatermark(),
      );
    try {
      const ordinal = await indexOp(index, { joins: [COL_A] });
      expect(supportsDeliveryTracking(manager)).toBe(true);
      if (!supportsDeliveryTracking(manager)) return;
      expect(await manager.pendingDelivery(DOC, ordinal)).toEqual([]);
    } finally {
      await storage.cleanup();
    }
  });
});
