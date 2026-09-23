import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentPurgeService } from "../../src/admin/document-purge-service.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import { PropagationMode } from "../../src/shared/types.js";
import {
  supportsDocumentPurgeQuarantine,
  type ISyncManager,
} from "../../src/sync/interfaces.js";
import {
  addChild,
  createDocument,
  createDrive,
  createPostgresDatabase,
  deleteDocument,
  emptyRows,
  renameDocument,
  rowsAbout,
} from "./helpers.js";
import {
  buildSyncedClient,
  buildSyncedReactor,
  ChannelSwitch,
  connect,
  deliveredDocumentIds,
  FILTER,
  remoteNames,
} from "./sync-pair.js";

type PgDatabase = Awaited<ReturnType<typeof createPostgresDatabase>>;

async function isDeletedOn(
  module: InProcessReactorModule,
  id: string,
): Promise<boolean> {
  const row = await module.database
    .selectFrom("DocumentSnapshot")
    .select("isDeleted")
    .where("documentId", "=", id)
    .where("scope", "=", "document")
    .executeTakeFirst();
  return row?.isDeleted === true;
}

async function flushed(
  channelSwitch: ChannelSwitch,
  modules: InProcessReactorModule[],
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await vi.waitUntil(
    () =>
      [...channelSwitch.channels.values()].every(
        (channel) =>
          channel.outbox.items.length === 0 && channel.inbox.items.length === 0,
      ),
    { timeout: 15_000, interval: 20 },
  );
  for (const module of modules) await module.readModelCoordinator.drain();
  await new Promise((resolve) => setTimeout(resolve, 200));
}

function purgeSync(module: InProcessReactorModule) {
  const sync: ISyncManager = module.syncModule!.syncManager;
  if (!supportsDocumentPurgeQuarantine(sync)) {
    throw new Error("sync manager lacks the purge capability");
  }
  return sync;
}

describe("purge across two reactors (Postgres)", () => {
  let dbA: PgDatabase;
  let dbB: PgDatabase;
  const extraKysely: Array<Kysely<Database>> = [];
  const modules: InProcessReactorModule[] = [];

  beforeEach(async () => {
    dbA = await createPostgresDatabase("reactor_gdpr_sync_a");
    dbB = await createPostgresDatabase("reactor_gdpr_sync_b");
  });

  afterEach(async () => {
    for (const module of modules.splice(0)) {
      await module.reactor.kill().completed;
    }
    for (const kysely of extraKysely.splice(0)) await kysely.destroy();
    await dbA.drop();
    await dbB.drop();
  });

  it("stores and dead-letters nothing when a peer replays the purged history", async () => {
    const channelSwitch = new ChannelSwitch();
    const a = await buildSyncedReactor(channelSwitch, { kysely: dbA.kysely });
    const b = await buildSyncedReactor(channelSwitch, { kysely: dbB.kysely });
    modules.push(a, b);

    await createDrive(a, "drive");
    await connect(channelSwitch, a, b, "drive");
    await vi.waitUntil(
      async () => (await rowsAbout(b.database, "drive")).Operation > 0,
      { timeout: 15_000, interval: 20 },
    );
    // Written on B, so B's own backfill carries it back to A.
    await createDocument(b, "doc");
    await addChild(b, "drive", "doc");
    await renameDocument(b, "doc", "edited");
    await deleteDocument(b, "doc");
    await vi.waitUntil(() => isDeletedOn(a, "doc"), {
      timeout: 15_000,
      interval: 20,
    });
    await flushed(channelSwitch, [a, b]);

    const result = await new DocumentPurgeService(a).purgeDocuments(["doc"], {
      directiveId: "sync-test",
    });
    expect(result.purged).toEqual(["doc"]);
    expect(await rowsAbout(a.database, "doc")).toEqual(emptyRows());

    // Reset B's push cursor: a re-added remote backfills from ordinal 0.
    const { toA, toB } = remoteNames("drive");
    const replayFrom = channelSwitch.delivered.length;
    await b.syncModule!.syncManager.remove(toA);
    await b.syncModule!.syncManager.add(
      toA,
      DriveCollectionId.forDrive("drive"),
      { type: "internal", parameters: {} },
      FILTER,
    );
    await flushed(channelSwitch, [a, b]);

    expect(deliveredDocumentIds(channelSwitch, toB, replayFrom)).toContain(
      "doc",
    );
    expect(await rowsAbout(a.database, "doc")).toEqual(emptyRows());
    expect(
      await a.database.selectFrom("sync_dead_letters").selectAll().execute(),
    ).toEqual([]);

    // A restart forgets the in-memory sets; the journal restores them.
    await a.reactor.kill().completed;
    modules.splice(modules.indexOf(a), 1);
    const restartedDb = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: dbA.url, max: 10 }),
      }),
    });
    extraKysely.push(restartedDb);
    const restarted = await buildSyncedReactor(channelSwitch, {
      kysely: restartedDb,
    });
    modules.push(restarted);
    expect(purgeSync(restarted).isInboundQuarantined("doc")).toBe(true);

    // A remote added after the purge replays it again, under a new name.
    channelSwitch.pair("toB-fresh", "toA-fresh");
    const freshFrom = channelSwitch.delivered.length;
    await b.syncModule!.syncManager.add(
      "toA-fresh",
      DriveCollectionId.forDrive("drive"),
      { type: "internal", parameters: {} },
      FILTER,
    );
    await restarted.syncModule!.syncManager.add(
      "toB-fresh",
      DriveCollectionId.forDrive("drive"),
      { type: "internal", parameters: {} },
      FILTER,
    );
    await flushed(channelSwitch, [restarted, b]);

    expect(
      deliveredDocumentIds(channelSwitch, "toB-fresh", freshFrom),
    ).toContain("doc");
    expect(await rowsAbout(restarted.database, "doc")).toEqual(emptyRows());
    expect(
      await restarted.database
        .selectFrom("sync_dead_letters")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      (await rowsAbout(restarted.database, "drive")).Operation,
    ).toBeGreaterThan(0);
  }, 90_000);

  it("delivers a cascade-deleted child's deletion before purging the drive", async () => {
    const channelSwitch = new ChannelSwitch();
    const clientA = await buildSyncedClient(channelSwitch, {
      kysely: dbA.kysely,
    });
    const a = clientA.reactorModule!;
    const b = await buildSyncedReactor(channelSwitch, { kysely: dbB.kysely });
    modules.push(a, b);

    await createDrive(a, "drive");
    await connect(channelSwitch, a, b, "drive");
    await createDocument(a, "kid");
    await addChild(a, "drive", "kid");
    await vi.waitUntil(
      async () => (await rowsAbout(b.database, "kid")).Operation > 0,
      { timeout: 15_000, interval: 20 },
    );

    await clientA.client.deleteDocument("drive", PropagationMode.Cascade);
    await vi.waitUntil(
      async () =>
        (await isDeletedOn(b, "kid")) && (await isDeletedOn(b, "drive")),
      { timeout: 15_000, interval: 20 },
    );
    const kidOnB = await b.database
      .selectFrom("Operation")
      .select("action")
      .where("documentId", "=", "kid")
      .execute();
    expect(
      kidOnB.some(
        (row) => (row.action as { type: string }).type === "DELETE_DOCUMENT",
      ),
    ).toBe(true);
    await flushed(channelSwitch, [a, b]);

    const service = new DocumentPurgeService(a);
    const plan = await service.planPurge(["drive"]);
    expect(
      plan.candidates.map(({ documentId, status }) => ({ documentId, status })),
    ).toEqual(
      expect.arrayContaining([
        { documentId: "drive", status: "ready" },
        { documentId: "kid", status: "ready" },
      ]),
    );

    const result = await service.purgeDocuments(
      plan.candidates.map(({ documentId }) => documentId),
      { directiveId: "cascade" },
    );
    expect(result.purged.sort()).toEqual(["drive", "kid"]);
    expect(result.removedRemotes).toEqual([remoteNames("drive").toB]);
    expect(await rowsAbout(a.database, "kid")).toEqual(emptyRows());
    expect(await rowsAbout(a.database, "drive")).toEqual(emptyRows());
  }, 90_000);
});
