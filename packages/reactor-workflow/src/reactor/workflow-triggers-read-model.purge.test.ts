import {
  JobStatus,
  REACTOR_SCHEMA,
  ReactorBuilder,
  isPurgeMarker,
  supportsLiveReadModelRegistration,
  type DocumentViewDatabase,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowRunStore } from "./store.js";
import {
  WORKFLOW_TRIGGERS_READ_MODEL,
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  WorkflowTriggersReadModel,
} from "./workflow-triggers-read-model.js";

const PG_URL = process.env.REACTOR_TEST_PG_URL;
const DATABASE = "reactor_workflow_purge";

const step = (stepId: string) => ({
  stepId,
  key: stepId,
  pieceName: "fake",
  blockName: "ok",
  status: "SUCCEEDED" as const,
  input: { in: stepId },
  output: { out: stepId },
  port: "next",
});

async function freshDatabase() {
  const admin = new Pool({ connectionString: PG_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${DATABASE}"`);
  const url = new URL(PG_URL!);
  url.pathname = `/${DATABASE}`;
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    async drop() {
      try {
        await db.destroy();
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

describe.skipIf(!PG_URL)(
  "WorkflowTriggersReadModel on a purge [Postgres]",
  () => {
    let database: Awaited<ReturnType<typeof freshDatabase>>;
    let module: InProcessReactorModule;
    let relationalDb: IRelationalDb;
    let runtime: WorkflowRuntimeService;
    let store: WorkflowRunStore;

    beforeEach(async () => {
      database = await freshDatabase();
      module = await new ReactorBuilder()
        .withKysely(database.db as Parameters<ReactorBuilder["withKysely"]>[0])
        .withDocumentModelSources([documentModelDocumentModelModule as never])
        .buildModule();
      relationalDb = createFreshRelationalDb();
      runtime = testRuntime({ relationalDb });
      store = await WorkflowRunStore.create(relationalDb);
    });

    afterEach(async () => {
      try {
        await module.reactor.kill().completed;
      } finally {
        await database.drop();
      }
    });

    function reactorDb(): Kysely<DocumentViewDatabase> {
      return (module.database as unknown as Kysely<unknown>).withSchema(
        REACTOR_SCHEMA,
      ) as unknown as Kysely<DocumentViewDatabase>;
    }

    function readModel(): WorkflowTriggersReadModel {
      return new WorkflowTriggersReadModel(
        reactorDb(),
        module.operationIndex,
        module.writeCache,
        module.processorManagerConsistencyTracker,
        runtime,
      );
    }

    async function settle(jobId: string): Promise<void> {
      let status: JobStatus | undefined;
      let error: unknown;
      await vi.waitUntil(
        async () => {
          const info = await module.reactor.getJobStatus(jobId);
          status = info.status;
          error = info.error;
          return status === JobStatus.READ_READY || status === JobStatus.FAILED;
        },
        { timeout: 20_000, interval: 20 },
      );
      expect(error).toBeUndefined();
      expect(status).toBe(JobStatus.READ_READY);
    }

    async function createDocument(): Promise<string> {
      const document = withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
        { id: generateId() },
      );
      await settle((await module.reactor.create(document)).id);
      return document.header.id;
    }

    async function purge(documentId: string): Promise<void> {
      await settle((await module.reactor.deleteDocument(documentId)).id);
      const [info] = await module.documentPurgeService.enqueuePurge(
        [documentId],
        "request-1",
      );
      await settle(info.id);
    }

    async function run(
      options: {
        documents?: string[];
        payload?: unknown;
        rerunOf?: string;
      } = {},
    ): Promise<string> {
      const runId = await store.startRun({
        workflowId: "wf-purge",
        workflowName: "Purge",
        workflowVersion: 1,
        triggerKind: "document-event",
        triggerPayload: options.payload,
        rerunOf: options.rerunOf,
      });
      await store.recordStep(runId, 0, step("a"));
      await store.recordRunDocuments(runId, options.documents ?? []);
      await store.finishRun(runId, {
        status: "SUCCEEDED",
        steps: [step("a")],
      } as never);
      return runId;
    }

    // Runs that carried the doomed id, and ones that did not.
    async function seedRuns(doomed: string, kept: string) {
      const handed = await run({ documents: [doomed, kept] });
      return {
        gone: [
          handed,
          await run({ rerunOf: handed }),
          await run({ payload: { documentId: doomed } }),
        ],
        kept: [
          await run({ documents: [kept] }),
          await run({ payload: { documentId: kept } }),
        ],
      };
    }

    async function expectErased(runs: { gone: string[]; kept: string[] }) {
      for (const runId of runs.gone) {
        expect(await store.getRun(runId)).toBeUndefined();
        expect(await store.getSteps(runId)).toEqual([]);
        expect(await store.getRunDocuments(runId)).toEqual([]);
      }
      for (const runId of runs.kept) {
        expect(await store.getRun(runId)).toBeDefined();
        expect(await store.getSteps(runId)).toHaveLength(1);
      }
    }

    async function sweepToHead(model: WorkflowTriggersReadModel) {
      const present = await module.operationIndex.getOrdinalsInRange(
        0,
        2 ** 31 - 1,
        100_000,
      );
      return model.sweep(
        Math.max(0, ...present),
        present.filter((ordinal) => ordinal > model.appliedThrough),
      );
    }

    async function markerOf(documentId: string) {
      const present = await module.operationIndex.getOrdinalsInRange(
        0,
        2 ** 31 - 1,
        100_000,
      );
      const found = (await module.operationIndex.getByOrdinals(present)).find(
        (item) =>
          isPurgeMarker(item.operation) &&
          item.context.documentId === documentId,
      );
      expect(found).toBeDefined();
      return found!;
    }

    it("erases the runs that carried a purged id when the marker arrives live", async () => {
      const doomed = await createDocument();
      const kept = await createDocument();
      const runs = await seedRuns(doomed, kept);
      const model = readModel();
      await model.init();
      const coordinator = module.readModelCoordinator;
      if (!supportsLiveReadModelRegistration(coordinator)) {
        throw new Error("coordinator takes no live registration");
      }
      coordinator.addReadModel(model, WORKFLOW_TRIGGERS_READ_MODEL_STAGE);
      const erased = vi.spyOn(runtime, "onDocumentsPurged");

      await purge(doomed);

      await vi.waitUntil(() => erased.mock.calls.length > 0, {
        timeout: 10_000,
      });
      expect(erased).toHaveBeenCalledExactlyOnceWith([doomed]);
      await expect(erased.mock.results[0].value).resolves.toMatchObject({
        runs: 3,
      });
      await expectErased(runs);
    });

    it("erases them when the marker arrives only through a sweep", async () => {
      const doomed = await createDocument();
      const kept = await createDocument();
      const runs = await seedRuns(doomed, kept);
      const model = readModel();
      await model.init();
      const before = model.appliedThrough;

      await purge(doomed);
      expect(await store.getRun(runs.gone[0])).toBeDefined();
      const result = await sweepToHead(model);

      expect(result.blockedAt).toBeUndefined();
      expect(model.appliedThrough).toBeGreaterThan(before);
      await expectErased(runs);
    });

    it("does nothing when the marker arrives again", async () => {
      const doomed = await createDocument();
      const kept = await createDocument();
      const runs = await seedRuns(doomed, kept);
      const model = readModel();
      await model.init();
      await purge(doomed);
      await sweepToHead(model);
      const { context } = await markerOf(doomed);
      const erased = vi.spyOn(runtime, "onDocumentsPurged");

      // A rescan below the marker, then a restart: boot replay re-delivers it.
      for (let pass = 0; pass < 2; pass++) {
        await reactorDb()
          .updateTable("ViewState")
          .set({ lastOrdinal: context.ordinal - 1 })
          .where("readModelId", "=", WORKFLOW_TRIGGERS_READ_MODEL)
          .execute();
        await readModel().init();
      }

      expect(erased).toHaveBeenCalledTimes(2);
      for (const result of erased.mock.results) {
        await expect(result.value).resolves.toEqual({
          runs: 0,
          steps: 0,
          documents: 0,
          dedupeKeysUnlinked: 0,
        });
      }
      await expectErased(runs);
    });
  },
);
