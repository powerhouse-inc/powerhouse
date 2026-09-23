import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { KyselyDocumentPurger } from "../../src/storage/kysely/document-purger.js";
import { supportsDocumentPurgeQuarantine } from "../../src/sync/interfaces.js";
import {
  addChild,
  createDocument,
  createDrive,
  deleteDocument,
  emptyRows,
  renameDocument,
  rowsAbout,
} from "./helpers.js";
import {
  buildSyncedReactor,
  ChannelSwitch,
  connect,
  deliveredDocumentIds,
  FILTER,
  remoteNames,
} from "./sync-pair.js";

describe("a purged document replayed by a peer", () => {
  const modules: InProcessReactorModule[] = [];

  afterEach(() => {
    for (const module of modules.splice(0)) module.reactor.kill();
  });

  it("is stored nowhere and dead-letters nothing", async () => {
    const channelSwitch = new ChannelSwitch();
    const a = await buildSyncedReactor(channelSwitch);
    const b = await buildSyncedReactor(channelSwitch);
    modules.push(a, b);

    await createDrive(a, "drive");
    await connect(channelSwitch, a, b, "drive");
    await vi.waitUntil(
      async () => (await rowsAbout(b.database, "drive")).Operation > 0,
      { timeout: 10_000, interval: 20 },
    );
    // Written on B, so B's own backfill carries it back to A.
    await createDocument(b, "doc");
    await addChild(b, "drive", "doc");
    await renameDocument(b, "doc", "edited");
    await deleteDocument(b, "doc");

    await vi.waitUntil(
      async () => {
        const rows = await rowsAbout(a.database, "doc");
        const deleted = await a.database
          .selectFrom("DocumentSnapshot")
          .select("isDeleted")
          .where("documentId", "=", "doc")
          .where("isDeleted", "=", true)
          .executeTakeFirst();
        return rows.Operation > 0 && deleted !== undefined;
      },
      { timeout: 10_000, interval: 20 },
    );

    const syncA = a.syncModule!.syncManager;
    if (!supportsDocumentPurgeQuarantine(syncA)) {
      throw new Error("SyncManager lacks the purge capability");
    }
    syncA.quarantineInbound(["doc"]);
    await a.readModelCoordinator.drain();
    await new KyselyDocumentPurger(a.database).purge(["doc"], {
      directiveId: "replay-test",
    });
    a.writeCache.invalidate("doc");
    syncA.quarantineOutbound(["doc"]);
    expect(await rowsAbout(a.database, "doc")).toEqual(emptyRows());

    // Re-adding the remote on B replays its whole history from ordinal 0.
    const { toA, toB } = remoteNames("drive");
    const replayFrom = channelSwitch.delivered.length;
    const syncB = b.syncModule!.syncManager;
    await syncB.remove(toA);
    await syncB.add(
      toA,
      DriveCollectionId.forDrive("drive"),
      { type: "internal", parameters: {} },
      FILTER,
    );

    const channelToA = channelSwitch.channels.get(toA)!;
    await vi.waitUntil(() => channelToA.outbox.items.length === 0, {
      timeout: 10_000,
    });
    await a.readModelCoordinator.drain();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(deliveredDocumentIds(channelSwitch, toB, replayFrom)).toContain(
      "doc",
    );
    expect(await rowsAbout(a.database, "doc")).toEqual(emptyRows());
    const channelToB = channelSwitch.channels.get(toB)!;
    expect(
      channelToB.deadLetter.items.filter((op) => op.documentId === "doc"),
    ).toEqual([]);
    expect(
      await a.database.selectFrom("sync_dead_letters").selectAll().execute(),
    ).toEqual([]);
    expect((await rowsAbout(a.database, "drive")).Operation).toBeGreaterThan(0);
  });
});
