import { PGlite } from "@electric-sql/pglite";
import type { ProcessorRecord } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentPurgeService } from "../../src/admin/document-purge-service.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { ProcessorManager } from "../../src/processors/processor-manager.js";
import { BaseReadModel } from "../../src/read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type {
  PurgeDirective,
  PurgeOutcome,
} from "../../src/shared/purge-types.js";
import { readPurgeJournal } from "../../src/storage/kysely/document-purger.js";
import { REACTOR_SCHEMA } from "../../src/storage/migrations/migrator.js";
import { deferred, type Deferred } from "../factories.js";
import {
  buildReactor,
  createDocument,
  createDrive,
  deleteDocument,
} from "./helpers.js";

class RecordingModel extends BaseReadModel {
  readonly calls: Array<{ ids: string[]; directive: PurgeDirective }> = [];
  failing = false;
  gate: Deferred | undefined;

  override async purgeDocuments(
    ids: string[],
    directive: PurgeDirective,
  ): Promise<PurgeOutcome> {
    this.calls.push({ ids, directive });
    if (this.gate) await this.gate.promise;
    if (this.failing) throw new Error("hook failed");
    return { readModelId: this.name, rowsAffected: ids.length, covered: true };
  }
}

describe("the purge journal", () => {
  const modules: InProcessReactorModule[] = [];

  afterEach(() => {
    for (const module of modules.splice(0)) module.reactor.kill();
  });

  async function setup(): Promise<{
    module: InProcessReactorModule;
    model: RecordingModel;
    kysely: Kysely<Database>;
  }> {
    const kysely = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    let model!: RecordingModel;
    const module = await buildReactor({
      kysely,
      readModelFactories: [
        async ({ operationIndex, writeCache }) => {
          model = new RecordingModel(
            kysely.withSchema(
              REACTOR_SCHEMA,
            ) as unknown as Kysely<DocumentViewDatabase>,
            operationIndex,
            writeCache,
            new ConsistencyTracker(),
            { readModelId: "recording", rebuildStateOnInit: false },
          );
          await model.init();
          return model;
        },
      ],
    });
    modules.push(module);
    return { module, model, kysely };
  }

  async function purgeCursor(
    module: InProcessReactorModule,
    readModelId = "recording",
  ): Promise<number> {
    const row = await module.database
      .selectFrom("ViewState")
      .select("lastPurgeOrdinal")
      .where("readModelId", "=", readModelId)
      .executeTakeFirstOrThrow();
    return Number(row.lastPurgeOrdinal);
  }

  async function deleted(module: InProcessReactorModule, id: string) {
    await createDocument(module, id);
    await deleteDocument(module, id);
    await module.readModelCoordinator.drain();
  }

  it("advances a model's cursor only once its hook returns", async () => {
    const { module, model } = await setup();
    await deleted(module, "first");
    expect(await purgeCursor(module)).toBe(0);

    model.gate = deferred();
    const purge = new DocumentPurgeService(module).purgeDocuments(["first"], {
      directiveId: "d1",
      purgedBy: "admin",
    });
    await vi.waitUntil(() => model.calls.length === 1);
    expect(await purgeCursor(module)).toBe(0);

    model.gate.resolve();
    const result = await purge;

    const [entry] = await readPurgeJournal(module.database, 0);
    expect(await purgeCursor(module)).toBe(entry!.ordinal);
    expect(model.calls).toEqual([
      { ids: ["first"], directive: { directiveId: "d1", purgedBy: "admin" } },
    ]);
    expect(result.readModels).toContainEqual({
      readModelId: "recording",
      rowsAffected: 1,
      covered: true,
    });
  });

  it("keeps a throwing hook's cursor and retries it at the next fan-out", async () => {
    const { module, model } = await setup();
    await deleted(module, "one");
    await deleted(module, "two");
    const service = new DocumentPurgeService(module);

    model.failing = true;
    const first = await service.purgeDocuments(["one"], { directiveId: "d1" });
    expect(first.purged).toEqual(["one"]);
    expect(first.readModels).toContainEqual(
      expect.objectContaining({
        readModelId: "recording",
        error: "hook failed",
      }),
    );
    expect(await purgeCursor(module)).toBe(0);

    model.failing = false;
    await service.purgeDocuments(["two"], { directiveId: "d2" });

    expect(model.calls.map(({ ids }) => ids)).toEqual([
      ["one"],
      ["one"],
      ["two"],
    ]);
    const journal = await readPurgeJournal(module.database, 0);
    expect(await purgeCursor(module)).toBe(journal.at(-1)!.ordinal);
  });

  it("journals sequential purges in the order they ran", async () => {
    const { module } = await setup();
    const ids = ["a", "b", "c", "d"];
    for (const id of ids) await deleted(module, id);
    const service = new DocumentPurgeService(module);

    for (const id of ids) {
      await service.purgeDocuments([id], { directiveId: `d-${id}` });
    }

    const journal = await readPurgeJournal(module.database, 0);
    expect(journal.map((entry) => entry.documentId)).toEqual(ids);
  });

  it("seeds a new model's purge cursor at 0 and applies the whole journal", async () => {
    const { module, kysely } = await setup();
    await deleted(module, "old-1");
    await deleted(module, "old-2");
    const service = new DocumentPurgeService(module);
    await service.purgeDocuments(["old-1"], { directiveId: "d1" });
    await service.purgeDocuments(["old-2"], { directiveId: "d2" });

    const late = new RecordingModel(
      kysely.withSchema(
        REACTOR_SCHEMA,
      ) as unknown as Kysely<DocumentViewDatabase>,
      module.operationIndex,
      module.writeCache,
      new ConsistencyTracker(),
      { readModelId: "late", rebuildStateOnInit: false },
    );
    late.gate = deferred();
    const init = late.init();
    await vi.waitUntil(() => late.calls.length === 1);
    expect(await purgeCursor(module, "late")).toBe(0);
    late.gate.resolve();
    await init;

    expect(late.calls.map(({ ids }) => ids)).toEqual([["old-1"], ["old-2"]]);
    const journal = await readPurgeJournal(module.database, 0);
    expect(await purgeCursor(module, "late")).toBe(journal.at(-1)!.ordinal);
  });

  it("closes a purged drive's processors and forwards to those that purge", async () => {
    const { module } = await setup();
    const disconnected: string[] = [];
    const purgedByProcessor: string[][] = [];
    const record = (driveId: string): ProcessorRecord => ({
      filter: {},
      processor: Object.assign(
        {
          onOperations: () => Promise.resolve(),
          onDisconnect: () => {
            disconnected.push(driveId);
            return Promise.resolve();
          },
        },
        {
          purgeDocuments: (ids: string[]): Promise<PurgeOutcome> => {
            purgedByProcessor.push(ids);
            return Promise.resolve({
              readModelId: `processor-${driveId}`,
              rowsAffected: 2,
              covered: true,
            });
          },
        },
      ),
    });
    await module.processorManager.registerFactory("purge-test", (header) => [
      record(header.id),
    ]);
    await createDrive(module, "drive-a");
    await createDrive(module, "drive-b");
    await vi.waitUntil(() => module.processorManager.getAll().length === 2);
    await deleteDocument(module, "drive-a");
    await module.readModelCoordinator.drain();

    const result = await new DocumentPurgeService(module).purgeDocuments(
      ["drive-a"],
      { directiveId: "drives" },
    );

    expect(
      result.readModels.find(
        (outcome) => outcome.readModelId === "processor-manager",
      ),
    ).toMatchObject({ covered: true, rowsAffected: 2 });
    expect(purgedByProcessor).toEqual([["drive-a"]]);
    expect(
      await module.database
        .selectFrom("ProcessorCursor")
        .select("driveId")
        .where("driveId", "=", "drive-a")
        .execute(),
    ).toEqual([]);

    // A drive whose deletion the manager never saw is closed by the purge itself.
    disconnected.length = 0;
    await (module.processorManager as ProcessorManager).purgeDocuments(
      ["drive-b"],
      {
        directiveId: "direct",
      },
    );
    expect(disconnected).toEqual(["drive-b"]);
    expect(module.processorManager.getAll()).toEqual([]);
    expect(
      await module.database
        .selectFrom("ProcessorCursor")
        .select("driveId")
        .where("driveId", "=", "drive-b")
        .execute(),
    ).toEqual([]);
  });
});
