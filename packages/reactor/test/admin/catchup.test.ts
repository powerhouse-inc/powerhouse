import { PGlite } from "@electric-sql/pglite";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCatchUpStatus,
  rescanCatchUp,
  type CatchUpAdminDatabase,
} from "../../src/admin/catch-up-admin.js";
import {
  CATCHUP_EXIT,
  parseCatchUpOptions,
} from "../../src/admin/catchup-options.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";
import { indexEntry } from "../catch-up/helpers.js";
import { createDocModelDocument } from "../factories.js";

const CLI = fileURLToPath(
  new URL("../../src/admin/run-catchup.ts", import.meta.url),
);

function runCli(args: string[]) {
  return spawnSync("pnpm", ["exec", "tsx", CLI, ...args], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
  });
}

describe("catchup arguments", () => {
  it.each([
    [[], /A command is required/],
    [["purge", "--pg", "x"], /Unknown command: purge/],
    [["status"], /One of --pg or --pglite is required/],
    [["status", "--pg", "a", "--pglite", "b"], /Pass only one/],
    [["status", "--pg", "a", "--all"], /status takes no/],
    [["rescan", "--pg", "a", "--all"], /rescan requires --from/],
    [
      ["rescan", "--pg", "a", "--from", "3"],
      /exactly one of --consumer or --all/,
    ],
    [
      ["rescan", "--pg", "a", "--from", "3", "--all", "--consumer", "x"],
      /exactly one of --consumer or --all/,
    ],
    [["rescan", "--pg", "a", "--from", "-1", "--all"], /non-negative integer/],
    [["status", "--pg"], /Missing value for --pg/],
    [["status", "--pg", "a", "--bogus", "b"], /Unknown argument: --bogus/],
  ])("refuses %j", (argv, message) => {
    expect(() => parseCatchUpOptions(argv)).toThrow(message);
  });

  it("parses a rescan of several consumers", () => {
    expect(
      parseCatchUpOptions([
        "rescan",
        "--pglite",
        "/tmp/store",
        "--schema",
        "custom",
        "--from",
        "12",
        "--consumer",
        "document-view",
        "--consumer",
        "processor-manager",
        "--dry-run",
      ]),
    ).toEqual({
      command: "rescan",
      pglite: "/tmp/store",
      schema: "custom",
      from: 12,
      consumers: ["document-view", "processor-manager"],
      all: false,
      dryRun: true,
    });
  });

  it("exits 64 on bad arguments and 68 when the store cannot be read", () => {
    const usage = runCli(["status"]);
    expect(usage.status).toBe(CATCHUP_EXIT.usage);
    expect(usage.stderr).toContain("Usage:");

    const failed = runCli([
      "status",
      "--pg",
      "postgres://nobody:nothing@127.0.0.1:1/none",
    ]);
    expect(failed.status).toBe(CATCHUP_EXIT.error);
  }, 60_000);
});

describe("catchup on a store", () => {
  let baseDb: Kysely<CatchUpAdminDatabase>;
  let db: Kysely<CatchUpAdminDatabase>;

  beforeEach(async () => {
    baseDb = new Kysely<CatchUpAdminDatabase>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) throw result.error;
    db = baseDb.withSchema(REACTOR_SCHEMA);

    const operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );
    const txn = operationIndex.start();
    txn.write(Array.from({ length: 6 }, (_, i) => indexEntry("doc-a", i)));
    await operationIndex.commit(txn);

    await db
      .insertInto("ViewState")
      .values([
        { readModelId: "document-view", lastOrdinal: 6 },
        { readModelId: "document-indexer", lastOrdinal: 2 },
      ])
      .execute();
    await db
      .insertInto("ProcessorCursor")
      .values({
        processorId: "pkg:drive:0",
        factoryId: "pkg",
        driveId: "drive",
        processorIndex: 0,
        lastOrdinal: 5,
        status: "active",
        lastError: null,
        lastErrorTimestamp: null,
      })
      .execute();
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function cursors() {
    const status = await readCatchUpStatus(db);
    return Object.fromEntries(
      status.cursors.map((cursor) => [cursor.id, cursor.lastOrdinal]),
    );
  }

  it("reports the head, the settled value and every cursor with its lag", async () => {
    const status = await readCatchUpStatus(db);
    expect(status).toMatchObject({ head: 6, settledThrough: 6, waitingOn: [] });
    expect(status.cursors).toEqual([
      { kind: "read-model", id: "document-indexer", lastOrdinal: 2, lag: 4 },
      { kind: "read-model", id: "document-view", lastOrdinal: 6, lag: 0 },
      { kind: "processor", id: "pkg:drive:0", lastOrdinal: 5, lag: 1 },
    ]);
  });

  it("counts a dry run without writing", async () => {
    const result = await rescanCatchUp(db, {
      from: 3,
      consumers: [],
      all: true,
      dryRun: true,
    });

    expect(result.rowsAbove).toBe(3);
    expect(result.changes).toEqual([
      {
        kind: "read-model",
        id: "document-indexer",
        lastOrdinal: 2,
        lowered: 2,
      },
      { kind: "read-model", id: "document-view", lastOrdinal: 6, lowered: 3 },
      { kind: "processor", id: "pkg:drive:0", lastOrdinal: 5, lowered: 3 },
    ]);
    expect(await cursors()).toEqual({
      "document-indexer": 2,
      "document-view": 6,
      "pkg:drive:0": 5,
    });
  });

  it("lowers only the chosen consumers, never raising one", async () => {
    await rescanCatchUp(db, {
      from: 3,
      consumers: ["document-view", "document-indexer"],
      all: false,
      dryRun: false,
    });

    expect(await cursors()).toEqual({
      "document-indexer": 2,
      "document-view": 3,
      "pkg:drive:0": 5,
    });
  });

  it("refuses a consumer with no cursor row", async () => {
    await expect(
      rescanCatchUp(db, {
        from: 0,
        consumers: ["nobody"],
        all: false,
        dryRun: false,
      }),
    ).rejects.toThrow(/No cursor row for: nobody/);
  });
});

describe("catchup rescan on a running reactor", () => {
  let database: Kysely<Database>;
  let module: InProcessReactorModule;

  beforeEach(async () => {
    database = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    module = await new ReactorBuilder()
      .withKysely(database)
      .withCatchUp({ intervalMs: 3_600_000 })
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
  });

  afterEach(async () => {
    await module.reactor.kill().completed;
    await database.destroy();
  });

  async function create(id: string): Promise<void> {
    const job = await module.reactor.create(createDocModelDocument({ id }));
    await vi.waitUntil(async () => {
      const status = await module.reactor.getJobStatus(job.id);
      return status.status === JobStatus.READ_READY;
    });
  }

  it("replays through the failed compare-and-set", async () => {
    await create("doc-1");
    await create("doc-2");
    await module.catchUp.sweepNow();
    const scoped = database.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<CatchUpAdminDatabase>;
    const head = (await readCatchUpStatus(scoped)).head;
    expect(
      (await readCatchUpStatus(scoped)).cursors.find(
        (cursor) => cursor.id === "document-view",
      )?.lastOrdinal,
    ).toBe(head);

    await rescanCatchUp(scoped, {
      from: 0,
      consumers: ["document-view"],
      all: false,
      dryRun: false,
    });

    // A later write gives the cursor a move, so its compare-and-set runs.
    await create("doc-3");
    const fetched = vi.spyOn(module.operationIndex, "getByOrdinals");
    await module.catchUp.sweepNow();
    await module.catchUp.sweepNow();

    const replayed = fetched.mock.calls.flatMap(([ordinals]) => ordinals);
    expect(replayed.length).toBeGreaterThan(0);
    expect(Math.min(...replayed)).toBe(1);
    const view = (await readCatchUpStatus(scoped)).cursors.find(
      (cursor) => cursor.id === "document-view",
    );
    expect(view?.lastOrdinal).toBe((await readCatchUpStatus(scoped)).head);
    await expect(module.documentView.get("doc-2")).resolves.toMatchObject({
      header: { id: "doc-2" },
    });
  });
});
