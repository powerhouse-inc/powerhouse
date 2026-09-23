import {
  setModelName,
  type DocumentModelDocument,
  type OperationWithContext,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { Kysely, PostgresDialect } from "kysely";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DocumentPurgeService } from "../../src/admin/document-purge-service.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import {
  ReactorEventTypes,
  type JobReadReadyEvent,
} from "../../src/events/types.js";
import { createHybridProjectionCoordinatorFactory } from "../../src/projection/create-hybrid-projection-coordinator.js";
import { HybridProjectionCoordinator } from "../../src/projection/hybrid-projection-coordinator.js";
import type { DbConfig } from "../../src/projection/protocol.js";
import {
  createProjectionThreadTransport,
  type IProjectionTransport,
} from "../../src/projection/transport.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import {
  JobStatus,
  type JobInfo,
  type PagedResults,
} from "../../src/shared/types.js";
import { readPurgeJournal } from "../../src/storage/kysely/document-purger.js";
import { createDocModelDocument } from "../factories.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
// The worker hardcodes the `reactor` schema, so isolation is a database.
const TEST_DATABASE = "reactor_hybrid_worker_test";
// Runs the .ts entry via tsx; the default entry path points at dist/.
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("./projection-worker-bootstrap.mjs", import.meta.url),
);
const WITHIN_MS = 5_000;

function dbConfigFor(url: string, database: string): DbConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

async function within<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = WITHIN_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const bomb = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not settle within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, bomb]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function keyOf(op: OperationWithContext): string {
  const { documentId, scope, branch } = op.context;
  return `${documentId}:${scope}:${branch}:${op.operation.index}`;
}

/** One counter shared by the host read model and the READ_READY subscriber. */
class Sequence {
  private value = 0;

  next(): number {
    this.value += 1;
    return this.value;
  }
}

class RecordingReadModel implements IReadModel {
  readonly name = "recording";
  readonly batches: OperationWithContext[][] = [];
  /** Sequence number at which each operation was indexed host-side. */
  readonly indexedAt = new Map<string, number>();

  constructor(private readonly sequence: Sequence) {}

  indexOperations(operations: OperationWithContext[]): Promise<void> {
    this.batches.push(operations);
    for (const op of operations) {
      this.indexedAt.set(keyOf(op), this.sequence.next());
    }
    return Promise.resolve();
  }
}

describe("hybrid projection worker over Postgres", () => {
  const sequence = new Sequence();
  const recording = new RecordingReadModel(sequence);
  /** Every JOB_READ_READY seen on the host bus, with its sequence number. */
  const readReady: Array<{ event: JobReadReadyEvent; seq: number }> = [];

  let adminPool: Pool | undefined;
  let baseDb: Kysely<Database> | undefined;
  let module: InProcessReactorModule | undefined;

  async function waitForJob(
    jobId: string,
    accept: JobStatus[],
  ): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const status = await module!.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(status.error?.message ?? "job failed");
        }
        return accept.includes(status.status);
      },
      { timeout: WITHIN_MS },
    );
    return await module!.reactor.getJobStatus(jobId);
  }

  async function createDocument(id: string): Promise<void> {
    const job = await module!.reactor.create(createDocModelDocument({ id }));
    await waitForJob(job.id, [JobStatus.READ_READY]);
  }

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: PG_TEST_URL });
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await adminPool.query(`CREATE DATABASE "${TEST_DATABASE}"`);

    const db = dbConfigFor(PG_TEST_URL, TEST_DATABASE);
    baseDb = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ ...db, max: 4, application_name: "hybrid-test-host" }),
      }),
    });

    module = await new ReactorBuilder()
      .withKysely(baseDb)
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
      ])
      .withReadModel(recording)
      .withProjectionWorkerFactory(() =>
        createProjectionThreadTransport(BOOTSTRAP_PATH),
      )
      .withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          db,
          poolSize: 4,
          initTimeoutMs: 60_000,
          shutdownGraceMs: 500,
        }),
      )
      .buildModule();

    module.eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_type: number, event: JobReadReadyEvent) => {
        readReady.push({ event, seq: sequence.next() });
      },
    );
  });

  afterAll(async () => {
    if (module) {
      await module.reactor.kill().completed;
      const coordinator =
        module.readModelCoordinator as HybridProjectionCoordinator;
      await within(
        coordinator.shutdown(),
        "hybrid coordinator shutdown",
        10_000,
      );
      module = undefined;
    }
    if (baseDb) {
      await baseDb.destroy();
      baseDb = undefined;
    }
    if (adminPool) {
      await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
      await adminPool.end();
      adminPool = undefined;
    }
  });

  it("installs a HybridProjectionCoordinator", () => {
    expect(module!.readModelCoordinator).toBeInstanceOf(
      HybridProjectionCoordinator,
    );
  });

  it("consistency-token read returns the updated state", async () => {
    const docId = "hybrid-token-doc";
    await createDocument(docId);

    let last: JobInfo | undefined;
    for (let i = 1; i <= 3; i++) {
      const job = await module!.reactor.execute(docId, "main", [
        setModelName({ name: `name-${i}` }),
      ]);
      // WRITE_READY suffices for the token: the read must then wait on the worker.
      last = await waitForJob(job.id, [
        JobStatus.WRITE_READY,
        JobStatus.READ_READY,
      ]);
    }

    const doc = await within(
      module!.reactor.get<DocumentModelDocument>(
        docId,
        undefined,
        last!.consistencyToken,
      ),
      "reactor.get with a consistency token",
    );
    expect(doc.header.id).toBe(docId);
    expect(doc.state.global.name).toBe("name-3");
  });

  it("subscriptions fire on the host for an update", async () => {
    const docId = "hybrid-subscription-doc";
    await createDocument(docId);

    let unsubscribe = () => {};
    const updated = new Promise<PagedResults<PHDocument>>((resolve) => {
      unsubscribe = module!.subscriptionManager.onDocumentStateUpdated(
        (result) => resolve(result),
        { ids: [docId] },
      );
    });
    try {
      await module!.reactor.execute(docId, "main", [
        setModelName({ name: "subscribed" }),
      ]);
      const result = await within(updated, "onDocumentStateUpdated");
      expect(result.results.map((doc) => doc.header.id)).toContain(docId);
    } finally {
      unsubscribe();
    }
  });

  it("awaiter reaches READ_READY", async () => {
    const docId = "hybrid-awaiter-doc";
    await createDocument(docId);

    const job = await module!.reactor.execute(docId, "main", [
      setModelName({ name: "awaited" }),
    ]);
    const info = await waitForJob(job.id, [JobStatus.READ_READY]);
    expect(info.status).toBe(JobStatus.READ_READY);
  });

  // Last: covers every operation the cases above produced.
  it("host read model saw every operation exactly once, before READ_READY", () => {
    expect(readReady.length).toBeGreaterThan(0);

    const counts = new Map<string, number>();
    for (const op of recording.batches.flat()) {
      const key = keyOf(op);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const duplicated = [...counts].filter(([, count]) => count !== 1);
    expect(duplicated).toEqual([]);

    const relayed = new Set<string>();
    for (const { event, seq } of readReady) {
      for (const op of event.operations) {
        const key = keyOf(op);
        relayed.add(key);
        const indexedAt = recording.indexedAt.get(key);
        expect(indexedAt, `host index for ${key}`).toBeDefined();
        expect(
          indexedAt!,
          `host index before READ_READY for ${key}`,
        ).toBeLessThan(seq);
      }
    }
    expect([...counts.keys()].sort()).toEqual([...relayed].sort());
  });
});

describe("hybrid projection worker purge over Postgres", () => {
  const PURGE_DATABASE = "reactor_hybrid_purge_test";
  let adminPool: Pool | undefined;
  const kyselys: Array<Kysely<Database>> = [];
  const modules: InProcessReactorModule[] = [];
  const transports: IProjectionTransport[] = [];

  async function build(): Promise<InProcessReactorModule> {
    const db = dbConfigFor(PG_TEST_URL, PURGE_DATABASE);
    const kysely = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ ...db, max: 4, application_name: "purge-test-host" }),
      }),
    });
    kyselys.push(kysely);
    const built = await new ReactorBuilder()
      .withKysely(kysely)
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
      ])
      .withProjectionWorkerFactory(() => {
        const transport = createProjectionThreadTransport(BOOTSTRAP_PATH);
        transports.push(transport);
        return transport;
      })
      .withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          db,
          poolSize: 4,
          initTimeoutMs: 60_000,
          shutdownGraceMs: 500,
        }),
      )
      .buildModule();
    modules.push(built);
    return built;
  }

  async function shutdown(module: InProcessReactorModule): Promise<void> {
    await module.reactor.kill().completed;
    await within(
      (module.readModelCoordinator as HybridProjectionCoordinator).shutdown(),
      "hybrid coordinator shutdown",
      10_000,
    );
    modules.splice(modules.indexOf(module), 1);
  }

  async function deleted(module: InProcessReactorModule, id: string) {
    const settle = async (job: JobInfo) =>
      vi.waitUntil(
        async () => {
          const status = await module.reactor.getJobStatus(job.id);
          if (status.status === JobStatus.FAILED) {
            throw new Error(status.error?.message ?? "job failed");
          }
          return status.status === JobStatus.READ_READY;
        },
        { timeout: WITHIN_MS },
      );
    await settle(await module.reactor.create(createDocModelDocument({ id })));
    await settle(await module.reactor.deleteDocument(id));
    await module.readModelCoordinator.drain();
  }

  async function purgeCursors(
    module: InProcessReactorModule,
  ): Promise<Record<string, number>> {
    const rows = await module.database
      .selectFrom("ViewState")
      .select(["readModelId", "lastPurgeOrdinal"])
      .where("readModelId", "in", ["document-view", "document-indexer"])
      .execute();
    return Object.fromEntries(
      rows.map((row) => [row.readModelId, Number(row.lastPurgeOrdinal)]),
    );
  }

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: PG_TEST_URL });
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [PURGE_DATABASE],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${PURGE_DATABASE}"`);
    await adminPool.query(`CREATE DATABASE "${PURGE_DATABASE}"`);
  });

  afterAll(async () => {
    for (const module of [...modules]) await shutdown(module);
    for (const kysely of kyselys) await kysely.destroy();
    if (adminPool) {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [PURGE_DATABASE],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${PURGE_DATABASE}"`);
      await adminPool.end();
    }
  });

  it("reaches the shard, reports a stopped one, and converges on restart", async () => {
    const first = await build();
    await deleted(first, "purge-a");
    await deleted(first, "purge-b");
    const service = new DocumentPurgeService(first);

    const reached = await service.purgeDocuments(["purge-a"], {
      directiveId: "shard-up",
    });
    expect(reached.unacknowledgedShards).toEqual([]);
    const shardOutcomes = reached.readModels.filter((outcome) =>
      outcome.readModelId.includes("/"),
    );
    expect(
      shardOutcomes.map(({ readModelId, covered }) => ({
        model: readModelId.split("/")[1],
        covered,
      })),
    ).toEqual(
      expect.arrayContaining([
        { model: "document-view", covered: true },
        { model: "document-indexer", covered: true },
      ]),
    );
    const [firstEntry] = await readPurgeJournal(first.database, 0);
    expect(await purgeCursors(first)).toEqual({
      "document-view": firstEntry!.ordinal,
      "document-indexer": firstEntry!.ordinal,
    });

    await transports[0]!.terminate();
    const missed = await service.purgeDocuments(["purge-b"], {
      directiveId: "shard-down",
    });
    expect(missed.purged).toEqual(["purge-b"]);
    expect(missed.unacknowledgedShards).toEqual([0]);
    expect(await purgeCursors(first)).toEqual({
      "document-view": firstEntry!.ordinal,
      "document-indexer": firstEntry!.ordinal,
    });

    // A new host and shard read the journal on init and catch up.
    await shutdown(first);
    const restarted = await build();
    const journal = await readPurgeJournal(restarted.database, 0);
    expect(await purgeCursors(restarted)).toEqual({
      "document-view": journal.at(-1)!.ordinal,
      "document-indexer": journal.at(-1)!.ordinal,
    });
  }, 120_000);
});
