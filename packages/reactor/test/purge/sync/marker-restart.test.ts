import {
  PEER_CAPABILITIES,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { JobStatus } from "../../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { listPurged } from "../../../src/storage/kysely/document-purges.js";
import { KyselySyncHoldStorage } from "../../../src/storage/kysely/sync-hold-storage.js";
import { KyselySyncReceivedMarkerStorage } from "../../../src/storage/kysely/sync-received-marker-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { settledAtHead } from "../../catch-up/helpers.js";
import {
  createTestOperation,
  createTestSyncStoragePostgres,
  type TestSyncStorage,
} from "../../factories.js";
import { purgeMarker } from "../helpers.js";
import { FILTER, withContext } from "./harness.js";

const DOC = "purged-doc";
const COLLECTION = DriveCollectionId.forDrive("drive-restart");
const CONFIG = { type: "polling", parameters: {} };
const RETRY = { markerRetryBaseDelayMs: 20, markerRetryMaxDelayMs: 40 };

/** A reactor whose marker loads fail transiently while `failing.marker`. */
function mockReactor(failing: { marker: boolean }) {
  let jobs = 0;
  const markerJobs = new Set<string>();
  const load = vi.fn(
    (
      _documentId: string,
      _branch: string,
      operations: { action: unknown }[],
    ) => {
      const id = `job-${++jobs}`;
      const action = operations[0]?.action as { type?: string } | undefined;
      if (action?.type === "PURGE_DOCUMENT") markerJobs.add(id);
      return Promise.resolve({ id });
    },
  );
  const getJobStatus = vi.fn((id: string) =>
    Promise.resolve(
      markerJobs.has(id) && failing.marker
        ? {
            id,
            status: JobStatus.FAILED,
            error: { name: "Error", message: "trust outage", stack: "" },
          }
        : { id, status: JobStatus.READ_READY },
    ),
  );
  return {
    load,
    getJobStatus,
    loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
  };
}

function received(
  operation: OperationWithContext,
  documentId: string,
): SyncOperation {
  const syncOp = new SyncOperation(
    crypto.randomUUID(),
    "",
    [],
    "client",
    documentId,
    [operation.context.scope],
    "main",
    [operation],
  );
  syncOp.transported();
  return syncOp;
}

describe("a pushed marker across a served-side restart [Postgres]", () => {
  let storage: TestSyncStorage;
  let db: Kysely<Database>;
  const managers: SyncManager[] = [];

  const cursors = (): ISyncCursorStorage => storage.syncCursorStorage;
  const factory = {
    instance: (remoteId: string, remoteName: string) =>
      new GqlResponseChannel(
        new ConsoleLogger(["GqlResponseChannel"]),
        remoteId,
        remoteName,
        cursors(),
      ),
  } as unknown as IChannelFactory;

  async function start(failing: { marker: boolean }): Promise<SyncManager> {
    const manager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      storage.syncRemoteStorage,
      cursors(),
      storage.syncDeadLetterStorage,
      factory,
      new KyselyOperationIndex(db),
      mockReactor(failing) as unknown as IReactor,
      new EventBus(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
      RETRY,
      { capabilities: PEER_CAPABILITIES, flags: {} },
      new KyselySyncHoldStorage(storage.db),
      { listPurged: () => listPurged(db) },
      new KyselySyncReceivedMarkerStorage(db),
    );
    managers.push(manager);
    await manager.startup();
    return manager;
  }

  const markerRows = () =>
    db
      .selectFrom("sync_received_markers")
      .select(["remote_name", "document_id"])
      .execute();

  const inboxCursor = async () =>
    (await storage.syncCursorStorage.list("client")).find(
      (cursor) => cursor.cursorType === "inbox",
    )?.cursorOrdinal;

  beforeEach(async () => {
    storage = await createTestSyncStoragePostgres();
    db = storage.db as unknown as Kysely<Database>;
  });

  afterEach(async () => {
    for (const manager of managers.splice(0)) {
      await manager.shutdown().completed;
    }
    await storage.cleanup();
  });

  it("reloads the marker, so a later push does not ack past it", async () => {
    const failing = { marker: true };
    const first = await start(failing);
    await first.add("client", COLLECTION, CONFIG, FILTER, {}, "c1");
    const inbox = first.getByName("client").channel.inbox;
    const early = received(
      withContext(createTestOperation("other-doc"), "other-doc", 4),
      "other-doc",
    );
    inbox.add(early);
    await vi.waitFor(async () => expect(await inboxCursor()).toBe(4));
    const marker = withContext(purgeMarker(DOC), DOC, 5, "document");
    inbox.add(received(marker, DOC));
    await first.receiptsStored();
    expect(await markerRows()).toEqual([
      { remote_name: "client", document_id: DOC },
    ]);
    await first.shutdown().completed;
    managers.splice(0);

    const second = await start(failing);
    const restarted = second.getByName("client").channel.inbox;
    expect(restarted.items.map((item) => item.documentId)).toEqual([DOC]);
    expect(restarted.latestOrdinal).toBe(4);
    const later = received(
      withContext(createTestOperation("other-doc"), "other-doc", 7),
      "other-doc",
    );
    restarted.add(later);
    await vi.waitFor(() => expect(restarted.get(later.id)).toBeUndefined());
    expect(restarted.ackOrdinal).toBe(4);

    failing.marker = false;
    await vi.waitFor(() => expect(restarted.items).toEqual([]));
    expect(restarted.ackOrdinal).toBe(7);
    await second.receiptsStored();
    expect(await markerRows()).toEqual([]);
  });

  it("keeps the row while a resent copy is dropped, and drops it with the remote", async () => {
    const failing = { marker: true };
    const manager = await start(failing);
    await manager.add("client", COLLECTION, CONFIG, FILTER, {}, "c1");
    const inbox = manager.getByName("client").channel.inbox;
    const marker = withContext(purgeMarker(DOC), DOC, 5, "document");
    inbox.add(received(marker, DOC));
    const resent = received(marker, DOC);
    inbox.add(resent);
    expect(inbox.get(resent.id)).toBeUndefined();
    await manager.receiptsStored();
    expect(await markerRows()).toHaveLength(1);

    await manager.remove("client");
    expect(await markerRows()).toEqual([]);
  });
});
