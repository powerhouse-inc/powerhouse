import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  isPurgeMarker,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../src/core/reactor-client-builder.js";
import type {
  InProcessReactorClientModule,
  InProcessReactorModule,
} from "../../../src/core/types.js";
import type { DbConfig } from "../../../src/executor/worker/protocol.js";
import { createThreadTransport } from "../../../src/executor/worker/transport.js";
import { WorkerHandle } from "../../../src/executor/worker/worker-handle.js";
import { JobStatus } from "../../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../../src/sync/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestChannel } from "../../sync/channels/test-channel.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
// Workers hardcode the reactor schema, so the case gets its own database.
const TEST_DATABASE = `reactor_purge_workers_${process.pid}`;
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("../../sync/executor-worker-postgres-bootstrap.mjs", import.meta.url),
);
const REMOTE = "silent-peer";
const NUM_WORKERS = 2;
const CHILD = "purged-child";

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

describe("the host sync manager under the worker pool [Postgres]", () => {
  let adminPool: Pool;
  let baseDb: Kysely<Database>;
  let module: InProcessReactorClientModule | undefined;

  beforeEach(async () => {
    adminPool = new Pool({ connectionString: PG_TEST_URL });
    await adminPool.query(
      `DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`,
    );
    await adminPool.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    const pool = new Pool({
      ...dbConfigFor(PG_TEST_URL, TEST_DATABASE),
      max: 8,
    });
    // Dropping the database terminates whatever is still connected to it.
    pool.on("error", (error: Error & { code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
    baseDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  });

  afterEach(async () => {
    try {
      if (module) {
        await module.reactor.kill().completed;
        await module.reactorModule?.syncModule?.syncManager.shutdown()
          .completed;
        module = undefined;
      }
    } finally {
      await baseDb.destroy();
      await adminPool.query(
        `DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`,
      );
      await adminPool.end();
    }
  });

  async function build(): Promise<{
    reactorModule: InProcessReactorModule;
    sent: SyncEnvelope[];
  }> {
    const sent: SyncEnvelope[] = [];
    // No peer to hear from: the remote stays a silent peer.
    const channelFactory = {
      instance(
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel {
        return new TestChannel(remoteId, remoteName, cursorStorage, (e) => {
          sent.push(e);
        });
      },
    } as unknown as IChannelFactory;

    const db = dbConfigFor(PG_TEST_URL, TEST_DATABASE);
    const logger = new ConsoleLogger(["test", "worker"]);
    const builder = new ReactorBuilder()
      .withKysely(baseDb as never)
      .withSync(new SyncBuilder().withChannelFactory(channelFactory))
      .withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
        {
          packageName: "@powerhousedao/shared/document-drive",
          exportName: "driveDocumentModelModule",
        },
      ]);
    builder.withWorkerPool({
      numWorkers: NUM_WORKERS,
      db,
      factory: (index) =>
        new WorkerHandle({
          workerId: `purge-worker-${index}`,
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

    module = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    if (!module.reactorModule) throw new Error("reactor module not built");
    return { reactorModule: module.reactorModule, sent };
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

  function sentFor(sent: SyncEnvelope[], documentId: string) {
    return sent.flatMap((envelope) =>
      (envelope.operations ?? []).filter(
        (op) => op.context.documentId === documentId,
      ),
    );
  }

  it("holds the marker for a peer without document-purge although it cached the document's earlier versions", async () => {
    const { reactorModule, sent } = await build();
    const { reactor } = reactorModule;
    const syncManager = reactorModule.syncModule!.syncManager;

    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    const driveId = drive.header.id;
    await settled((await reactor.create(drive)).id);
    await settled(
      (await reactor.create(createDocModelDocument({ id: CHILD }))).id,
    );
    await settled(
      (
        await reactor.execute(driveId, "main", [
          addRelationshipAction(driveId, CHILD, "child"),
        ])
      ).id,
    );

    await syncManager.add(
      REMOTE,
      DriveCollectionId.forDrive(driveId),
      { type: "internal", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
    );
    // Served, so the gate looked up and cached the child's versions.
    await vi.waitUntil(() => sentFor(sent, CHILD).length > 0, {
      timeout: 10_000,
    });
    expect(await syncManager.listHolds()).toEqual([]);

    const db = reactorModule.database as unknown as Kysely<Database>;
    for (const table of [
      "Operation",
      "operation_index_operations",
      "Keyframe",
    ]) {
      await db
        .deleteFrom(table as "Operation")
        .where("documentId", "=", CHILD)
        .execute();
    }
    const marker = purgeMarker(CHILD);
    await seedPurgedDocument(
      {
        db,
        store: reactorModule.operationStore,
        index: reactorModule.operationIndex,
      },
      marker,
      { reopenMemberships: db },
    );
    await settled(
      (
        await reactor.execute(driveId, "main", [
          driveDocumentModelModule.actions.addFolder({
            id: "f1",
            name: "f1",
            parentFolder: null,
          }),
        ])
      ).id,
    );

    await vi.waitFor(
      async () =>
        expect(await syncManager.listHolds({ remoteName: REMOTE })).toEqual([
          expect.objectContaining({
            documentId: CHILD,
            reason: {
              protocol: "document-purge",
              version: 1,
              peerSupports: [],
            },
          }),
        ]),
      { timeout: 10_000 },
    );
    await vi.waitUntil(
      () =>
        sent.some((envelope) =>
          (envelope.operations ?? []).some(
            (op) => op.operation.action.type === "ADD_FOLDER",
          ),
        ),
      { timeout: 10_000 },
    );
    expect(sentFor(sent, CHILD).some((op) => isPurgeMarker(op))).toBe(false);
  }, 60_000);
});
