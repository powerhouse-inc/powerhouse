import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  setModelName,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../src/actions/index.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import { bucketFor } from "../../src/executor/worker-pool-router.js";
import type { DbConfig } from "../../src/executor/worker/protocol.js";
import { createThreadTransport } from "../../src/executor/worker/transport.js";
import { WorkerHandle } from "../../src/executor/worker/worker-handle.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { holdIndexCommit } from "../catch-up/helpers.js";
import { createDocModelDocument } from "../factories.js";
import { TestChannel } from "./channels/test-channel.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
// Workers hardcode the reactor schema, so each case gets its own database.
const TEST_DATABASE = "reactor_outbox_gap_test";
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("./executor-worker-postgres-bootstrap.mjs", import.meta.url),
);
const REMOTE = "gap-remote";
const NUM_WORKERS = 2;

function dbConfigFor(url: string, database: string): DbConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    poolSize: 4,
  };
}

/** Two document ids that route to different executor workers. */
function idsOnDifferentWorkers(): [string, string] {
  const first = "gap-doc-x";
  for (let i = 0; i < 1000; i++) {
    const candidate = `gap-doc-y-${i}`;
    if (bucketFor(candidate, NUM_WORKERS) !== bucketFor(first, NUM_WORKERS)) {
      return [first, candidate];
    }
  }
  throw new Error("no document id routes to the other worker");
}

type Harness = {
  module: InProcessReactorModule;
  sent: SyncEnvelope[];
  channel: () => TestChannel;
};

describe("sync outbox across a transient ordinal gap [Postgres]", () => {
  let adminPool: Pool;
  let baseDb: Kysely<Database>;
  let module: InProcessReactorModule | undefined;

  beforeEach(async () => {
    adminPool = new Pool({ connectionString: PG_TEST_URL });
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await adminPool.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    baseDb = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          ...dbConfigFor(PG_TEST_URL, TEST_DATABASE),
          max: 8,
          application_name: "outbox-gap-host",
        }),
      }),
    });
  });

  afterEach(async () => {
    if (module) {
      await module.reactor.kill().completed;
      await module.syncModule?.syncManager.shutdown().completed;
      module = undefined;
    }
    await baseDb.destroy();
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await adminPool.end();
  });

  async function build(mode: "workers" | "in-process"): Promise<Harness> {
    const sent: SyncEnvelope[] = [];
    let testChannel: TestChannel | undefined;
    const channelFactory: IChannelFactory = {
      instance(
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        testChannel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope) => {
            sent.push(envelope);
          },
        );
        return testChannel;
      },
    } as unknown as IChannelFactory;

    const builder = new ReactorBuilder()
      .withKysely(baseDb)
      .withSync(new SyncBuilder().withChannelFactory(channelFactory));

    if (mode === "workers") {
      const db = dbConfigFor(PG_TEST_URL, TEST_DATABASE);
      const logger = new ConsoleLogger(["test", "worker"]);
      builder
        .withDocumentModelSources([
          {
            packageName: "document-model",
            exportName: "documentModelDocumentModelModule",
          },
          {
            packageName: "@powerhousedao/shared/document-drive",
            exportName: "driveDocumentModelModule",
          },
        ])
        .withWorkerPool({
          numWorkers: NUM_WORKERS,
          db,
          factory: (index) =>
            new WorkerHandle({
              workerId: `gap-worker-${index}`,
              index,
              transport: createThreadTransport(BOOTSTRAP_PATH),
              initPayload: {
                poolConfig: {
                  enabled: true,
                  numWorkers: NUM_WORKERS,
                  workerType: "thread",
                },
                db,
                models: builder.getResolvedModelManifest() ?? [],
                executorConfig: {},
              },
              logger,
            }),
        });
    } else {
      builder
        .withDocumentModelSources([
          documentModelDocumentModelModule as never,
          driveDocumentModelModule as never,
        ])
        .withExecutorConfig({ maxConcurrency: 2 });
    }

    module = await builder.buildModule();
    return {
      module,
      sent,
      channel: () => {
        if (!testChannel) throw new Error("remote channel not created");
        return testChannel;
      },
    };
  }

  async function settled(jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await module!.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(status.error?.message ?? "job failed");
        }
        return status.status === JobStatus.READ_READY;
      },
      { timeout: 10_000 },
    );
  }

  function sentOpIds(sent: SyncEnvelope[]): Set<string> {
    const ids = new Set<string>();
    for (const envelope of sent) {
      for (const op of envelope.operations ?? []) ids.add(op.operation.id);
    }
    return ids;
  }

  async function runScenario(mode: "workers" | "in-process"): Promise<void> {
    const { module: reactorModule, sent, channel } = await build(mode);
    const { reactor } = reactorModule;
    const [docX, docY] = idsOnDifferentWorkers();

    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    const driveId = drive.header.id;
    await settled((await reactor.create(drive)).id);
    for (const id of [docX, docY]) {
      await settled((await reactor.create(createDocModelDocument({ id }))).id);
      await settled(
        (
          await reactor.execute(driveId, "main", [
            addRelationshipAction(driveId, id, "child"),
          ])
        ).id,
      );
    }

    await reactorModule.syncModule!.syncManager.add(
      REMOTE,
      DriveCollectionId.forDrive(driveId),
      { type: "internal", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
    );
    await vi.waitUntil(() => channel().outbox.latestOrdinal > 0, {
      timeout: 10_000,
    });

    const hold = await holdIndexCommit(
      baseDb.withSchema("reactor") as unknown as Kysely<StorageDatabase>,
      docX,
    );
    try {
      // Submission can wait on the job itself, so it is not awaited here.
      const submittedA = reactor.execute(docX, "main", [
        setModelName({ name: "written-first-committed-last" }),
      ]);
      await hold.waitUntilHeld();

      const jobB = await reactor.execute(docY, "main", [
        setModelName({ name: "committed-first" }),
      ]);
      await settled(jobB.id);
      const indexedB = await reactorModule.operationIndex.get(docY);
      const ordinalB = Math.max(
        ...indexedB.results.map((entry) => entry.ordinal ?? 0),
      );
      await vi.waitUntil(() => channel().outbox.latestOrdinal >= ordinalB, {
        timeout: 10_000,
      });

      await hold.release();
      await settled((await submittedA).id);

      const indexedA = await reactorModule.operationIndex.get(docX);
      const lastA = indexedA.results.at(-1)!;
      await vi.waitUntil(() => sentOpIds(sent).has(lastA.id), {
        timeout: 5_000,
      });
      expect(sentOpIds(sent).has(lastA.id)).toBe(true);
    } finally {
      await hold.remove();
    }
  }

  it.fails("sends a lower ordinal that commits after a higher one", async () => {
    await runScenario("workers");
  }, 60_000);

  it.fails("sends a lower ordinal that commits after a higher one, in process", async () => {
    await runScenario("in-process");
  }, 60_000);
});
