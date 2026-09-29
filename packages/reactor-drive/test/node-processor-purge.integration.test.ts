import { PGlite } from "@electric-sql/pglite";
import {
  ConsistencyTracker,
  EventBus,
  isPurgeMarker,
  JobStatus,
  REACTOR_SCHEMA,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorEventTypes,
  type IReactor,
  type IReactorClient,
  type InProcessReactorModule,
  type JobWriteReadyEvent,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addFolderAction } from "../src/actions.js";
import { ReactorDriveClient } from "../src/client/reactor-drive-client.js";
import { reactorDriveDocumentModelModule } from "../src/module.js";
import { NodeProcessor } from "../src/processors/node-processor.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { createP256Signer } from "./utils/p256-signer.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

type DropRule = {
  matches: (event: JobWriteReadyEvent) => boolean;
  resolve: (event: JobWriteReadyEvent) => void;
};

/** Drops one matching JOB_WRITE_READY before any subscriber sees it. */
class DroppingEventBus extends EventBus {
  private readonly rules: DropRule[] = [];

  dropWriteReady(
    matches: (event: JobWriteReadyEvent) => boolean,
  ): Promise<JobWriteReadyEvent> {
    return new Promise((resolve) => {
      this.rules.push({ matches, resolve });
    });
  }

  dropWriteReadyFor(documentId: string): Promise<JobWriteReadyEvent> {
    return this.dropWriteReady((event) =>
      event.operations.some((op) => op.context.documentId === documentId),
    );
  }

  dropMarkerFor(documentId: string): Promise<JobWriteReadyEvent> {
    return this.dropWriteReady((event) =>
      event.operations.some(
        (op) =>
          isPurgeMarker(op.operation) && op.context.documentId === documentId,
      ),
    );
  }

  override async emit(type: number, data: unknown): Promise<void> {
    if (type === ReactorEventTypes.JOB_WRITE_READY) {
      const event = data as JobWriteReadyEvent;
      const index = this.rules.findIndex((rule) => rule.matches(event));
      if (index !== -1) {
        const [rule] = this.rules.splice(index, 1);
        rule!.resolve(event);
        return;
      }
    }
    return super.emit(type, data);
  }
}

type Backend = {
  db: Kysely<unknown>;
  close(): Promise<void>;
};

let databaseCount = 0;

function pgliteBackend(): Promise<Backend> {
  const pg = new PGlite();
  const db = new Kysely<unknown>({ dialect: new PGliteDialect(pg) });
  return Promise.resolve({
    db,
    async close() {
      await db.destroy();
      await pg.close();
    },
  });
}

async function postgresBackend(): Promise<Backend> {
  const name = `reactor_drive_purge_${process.pid}_${databaseCount++}`;
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    async close() {
      try {
        await db.destroy();
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

type Harness = {
  module: InProcessReactorModule;
  reactor: IReactor;
  client: IReactorClient;
  signer: ISigner;
  bus: DroppingEventBus;
  drives: ReactorDriveClient;
  view: Kysely<ReactorDriveDatabase>;
  kill(): Promise<void>;
};

async function startHarness(db: Kysely<unknown>): Promise<Harness> {
  const bus = new DroppingEventBus();
  const reactorBuilder = new ReactorBuilder()
    .withKysely(db as never)
    .withEventBus(bus)
    .withCatchUp({ intervalMs: 3_600_000 })
    .withDocumentModelSources([
      reactorDriveDocumentModelModule as unknown as DocumentModelModule,
      documentModelDocumentModelModule,
    ])
    .withReadModelFactory(async ({ operationIndex, writeCache }) => {
      const processor = new NodeProcessor(
        db,
        REACTOR_SCHEMA,
        operationIndex,
        writeCache,
        new ConsistencyTracker(),
      );
      await processor.init();
      return processor;
    });
  const signer = await createP256Signer();
  const built = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(signer)
    .buildModule();
  const module = built.reactorModule!;
  const view = db.withSchema(
    REACTOR_SCHEMA,
  ) as unknown as Kysely<ReactorDriveDatabase>;
  return {
    module,
    reactor: module.reactor,
    client: built.client,
    signer,
    bus,
    drives: new ReactorDriveClient({
      reactor: built.client,
      readModel: new DriveNodeView(view),
    }),
    view,
    async kill() {
      await module.reactor.kill().completed;
    },
  };
}

async function succeeded(reactor: IReactor, jobId: string): Promise<void> {
  await vi.waitUntil(
    async () => {
      const info = await reactor.getJobStatus(jobId);
      if (info.status === JobStatus.FAILED) {
        throw new Error(
          `job ${jobId} failed: ${info.error?.name}: ${info.error?.message}`,
        );
      }
      return info.status === JobStatus.READ_READY;
    },
    { timeout: 20_000, interval: 20 },
  );
}

function childDocument(name: string): PHDocument {
  const doc = documentModelDocumentModelModule.utils.createDocument();
  doc.header.name = name;
  return doc;
}

async function nodesOf(view: Kysely<ReactorDriveDatabase>, id: string) {
  return view
    .selectFrom("DriveNode")
    .selectAll()
    .where((eb) => eb.or([eb("id", "=", id), eb("driveId", "=", id)]))
    .execute();
}

async function nameOf(view: Kysely<ReactorDriveDatabase>, docId: string) {
  return view
    .selectFrom("DocumentName")
    .select("name")
    .where("docId", "=", docId)
    .executeTakeFirst();
}

describe.each([
  ["PGlite", pgliteBackend],
  ["Postgres", postgresBackend],
] as const)("NodeProcessor purge [%s]", (_name, openBackend) => {
  let backend: Backend | undefined;
  let harness: Harness | undefined;

  afterEach(async () => {
    try {
      await harness?.kill();
    } finally {
      await backend?.close();
      harness = undefined;
      backend = undefined;
    }
  });

  async function start(): Promise<Harness> {
    backend = await openBackend();
    harness = await startHarness(backend.db);
    return harness;
  }

  /** A drive with a folder holding a file, deleted with both deletions lost. */
  async function deletedDriveWithRows(h: Harness) {
    const drive = await h.drives.create({ global: { name: "Doomed" } });
    const driveId = drive.header.id;
    const folder = await h.drives.addFolder(driveId, "Private");
    const file = childDocument("Secret");
    await h.drives.addFile(driveId, file, folder.id);
    const fileId = file.header.id;

    for (const id of [fileId, driveId]) {
      const lost = h.bus.dropWriteReadyFor(id);
      await h.reactor.deleteDocument(id, h.signer);
      await lost;
    }

    expect(await nodesOf(h.view, driveId)).toHaveLength(2);
    expect(await nameOf(h.view, fileId)).toEqual({ name: "Secret" });
    return { driveId, fileId };
  }

  async function purge(h: Harness, ids: string[]): Promise<string[]> {
    const infos = await h.module.documentPurgeService.enqueuePurge(
      ids,
      "request-1",
    );
    return infos.map((info) => info.id);
  }

  it("erases a purged drive's rows when the marker arrives live", async () => {
    const h = await start();
    const { driveId, fileId } = await deletedDriveWithRows(h);

    for (const jobId of await purge(h, [driveId, fileId])) {
      await succeeded(h.reactor, jobId);
    }

    expect(await nodesOf(h.view, driveId)).toHaveLength(0);
    expect(await nodesOf(h.view, fileId)).toHaveLength(0);
    expect(await nameOf(h.view, fileId)).toBeUndefined();
    expect(await nameOf(h.view, driveId)).toBeUndefined();
  });

  it("erases a purged drive's rows when the marker arrives only by sweep", async () => {
    const h = await start();
    const { driveId, fileId } = await deletedDriveWithRows(h);

    const lost = [h.bus.dropMarkerFor(driveId), h.bus.dropMarkerFor(fileId)];
    await purge(h, [driveId, fileId]);
    await Promise.all(lost);
    expect(await nodesOf(h.view, driveId)).toHaveLength(2);

    await h.module.catchUp.sweepNow();

    expect(await nodesOf(h.view, driveId)).toHaveLength(0);
    expect(await nodesOf(h.view, fileId)).toHaveLength(0);
    expect(await nameOf(h.view, fileId)).toBeUndefined();
  });

  it("re-inserts no purged child on a suffix replay of its drive", async () => {
    const h = await start();
    const drive = await h.drives.create({ global: { name: "Kept" } });
    const driveId = drive.header.id;

    const late = h.bus.dropWriteReadyFor(driveId);
    await h.client.executeAsync(driveId, "main", [
      addFolderAction({
        folderId: "late-folder",
        parentFolderId: null,
        name: "Late",
      }),
    ]);
    await late;

    const file = childDocument("Secret");
    await h.drives.addFile(driveId, file);
    const fileId = file.header.id;
    expect(await nodesOf(h.view, fileId)).toHaveLength(1);

    await succeeded(
      h.reactor,
      (await h.reactor.deleteDocument(fileId, h.signer)).id,
    );
    const [purgeJob] = await purge(h, [fileId]);
    await succeeded(h.reactor, purgeJob!);
    const driveLog = await h.module.operationIndex.get(driveId);
    const types = driveLog.results.map((entry) => entry.action.type);
    expect(types).toContain("ADD_RELATIONSHIP");
    expect(types).not.toContain("REMOVE_RELATIONSHIP");

    await h.module.catchUp.sweepNow();

    const ids = (await nodesOf(h.view, driveId)).map((row) => row.id);
    expect(ids).toEqual(["late-folder"]);
    expect(await nodesOf(h.view, fileId)).toHaveLength(0);
    expect(await nameOf(h.view, fileId)).toBeUndefined();
  });
});
