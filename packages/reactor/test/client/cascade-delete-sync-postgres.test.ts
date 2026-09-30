import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { withSignaturePolicy } from "@powerhousedao/shared/document-model";
import {
  ConsoleLogger,
  documentModelDocumentModelModule,
} from "document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../src/actions/index.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type {
  Database,
  InProcessReactorClientModule,
  InProcessReactorModule,
} from "../../src/core/types.js";
import { bucketFor } from "../../src/executor/worker-pool-router.js";
import type { DbConfig } from "../../src/executor/worker/protocol.js";
import { createThreadTransport } from "../../src/executor/worker/transport.js";
import { WorkerHandle } from "../../src/executor/worker/worker-handle.js";
import { JobStatus, PropagationMode } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { TRUST_ANY_SIGNER } from "../utils/signed-as.js";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
// Workers hardcode the reactor schema, so each case gets its own database.
const TEST_DATABASE = "reactor_cascade_delete_test";
const BOOTSTRAP_PATH = fileURLToPath(
  new URL("../sync/executor-worker-postgres-bootstrap.mjs", import.meta.url),
);
const REMOTE = "cascade-remote";
const NUM_WORKERS = 2;
const NUM_CHILDREN = 6;
const ENFORCING: Partial<ReactorFeatureFlags> = {
  documentDecisions: true,
  authEnforcement: true,
};

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

/** Child ids spread evenly across every executor worker. */
function childIds(): string[] {
  const perWorker = NUM_CHILDREN / NUM_WORKERS;
  const byBucket = new Map<number, string[]>();
  for (let i = 0; i < 10_000; i++) {
    const id = `cascade-child-${i}`;
    const ids = byBucket.get(bucketFor(id, NUM_WORKERS)) ?? [];
    if (ids.length < perWorker) ids.push(id);
    byBucket.set(bucketFor(id, NUM_WORKERS), ids);
  }
  const all = [...byBucket.values()].flat();
  if (all.length !== NUM_CHILDREN) {
    throw new Error("children do not cover every worker");
  }
  return all;
}

type Harness = {
  module: InProcessReactorClientModule;
  reactorModule: InProcessReactorModule;
  sent: SyncEnvelope[];
  sentTo: (remoteName: string) => SyncEnvelope[];
  channel: () => TestChannel;
};

describe("cascade delete of a drive served to its remote [Postgres]", () => {
  let adminPool: Pool;
  let baseDb: Kysely<Database>;
  let module: InProcessReactorClientModule | undefined;

  beforeEach(async () => {
    adminPool = new Pool({ connectionString: PG_TEST_URL });
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`);
    await adminPool.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    const pool = new Pool({
      ...dbConfigFor(PG_TEST_URL, TEST_DATABASE),
      max: 8,
      application_name: "cascade-delete-host",
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

  async function build(
    mode: "workers" | "in-process",
    flags?: Partial<ReactorFeatureFlags>,
  ): Promise<Harness> {
    const sent: SyncEnvelope[] = [];
    const sentByRemote = new Map<string, SyncEnvelope[]>();
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
            const own = sentByRemote.get(remoteName) ?? [];
            own.push(envelope);
            sentByRemote.set(remoteName, own);
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
              workerId: `cascade-worker-${index}`,
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
        .withExecutorConfig({ maxConcurrency: 2, featureFlags: flags });
      if (flags) builder.withTrustPolicy(TRUST_ANY_SIGNER);
    }

    module = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    if (!module.reactorModule) throw new Error("reactor module not built");
    return {
      module,
      reactorModule: module.reactorModule,
      sent,
      sentTo: (remoteName) => sentByRemote.get(remoteName) ?? [],
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

  async function deleteRow(
    documentId: string,
  ): Promise<{ opId: string; ordinal: number }> {
    const { rows } = await sql<{ opId: string; ordinal: string }>`
      SELECT "opId", ordinal FROM reactor.operation_index_operations
      WHERE "documentId" = ${documentId}
        AND action->>'type' = 'DELETE_DOCUMENT'`.execute(baseDb);
    expect(rows).toHaveLength(1);
    return { opId: rows[0].opId, ordinal: Number(rows[0].ordinal) };
  }

  async function leftOrdinal(
    documentId: string,
    collectionId: string,
  ): Promise<number | null> {
    const { rows } = await sql<{ leftOrdinal: string | null }>`
      SELECT "leftOrdinal" FROM reactor.document_collections
      WHERE "documentId" = ${documentId}
        AND "collectionId" = ${collectionId}`.execute(baseDb);
    expect(rows).toHaveLength(1);
    return rows[0].leftOrdinal === null ? null : Number(rows[0].leftOrdinal);
  }

  function sentOpIds(sent: SyncEnvelope[]): Set<string> {
    const ids = new Set<string>();
    for (const envelope of sent) {
      for (const op of envelope.operations ?? []) ids.add(op.operation.id);
    }
    return ids;
  }

  async function runScenario(mode: "workers" | "in-process"): Promise<void> {
    const {
      module: clientModule,
      reactorModule,
      sent,
      channel,
    } = await build(mode);
    const { reactor } = reactorModule;
    const children = childIds();

    const drive = withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    const driveId = drive.header.id;
    await settled((await reactor.create(drive)).id);
    for (const id of children) {
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

    await clientModule.client.deleteDocument(driveId, PropagationMode.Cascade);

    const collectionId = DriveCollectionId.forDrive(driveId, "main").key;
    const found = await reactorModule.operationIndex.find(
      collectionId,
      undefined,
      undefined,
      { cursor: "0", limit: 10_000 },
    );
    const foundIds = new Set(found.results.map((entry) => entry.id));

    const deletes: string[] = [];
    for (const id of children) {
      const { opId, ordinal } = await deleteRow(id);
      const left = await leftOrdinal(id, collectionId);
      expect(left, `${id} membership closed`).not.toBeNull();
      expect(ordinal, `${id} delete before its membership closes`).toBeLessThan(
        left!,
      );
      expect(foundIds.has(opId), `${id} delete in the outbox`).toBe(true);
      deletes.push(opId);
    }
    deletes.push((await deleteRow(driveId)).opId);

    await vi.waitUntil(() => deletes.every((id) => sentOpIds(sent).has(id)), {
      timeout: 10_000,
    });
  }

  /** The document scope's action types in commit order, removals with target. */
  async function documentStream(documentId: string): Promise<string[]> {
    const { rows } = await sql<{ type: string; targetId: string | null }>`
      SELECT action->>'type' AS type, action->'input'->>'targetId' AS "targetId"
      FROM reactor.operation_index_operations
      WHERE "documentId" = ${documentId} AND scope = 'document'
      ORDER BY ordinal`.execute(baseDb);
    return rows.map((row) =>
      row.type === "REMOVE_RELATIONSHIP"
        ? `${row.type}:${row.targetId}`
        : row.type,
    );
  }

  async function addRemote(
    reactorModule: InProcessReactorModule,
    name: string,
    driveId: string,
    sentTo: Harness["sentTo"],
  ): Promise<void> {
    await reactorModule.syncModule!.syncManager.add(
      name,
      DriveCollectionId.forDrive(driveId),
      { type: "internal", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
    );
    await vi.waitUntil(() => sentTo(name).length > 0, { timeout: 10_000 });
  }

  async function expectServedBeforeLeaving(
    childId: string,
    driveId: string,
  ): Promise<string> {
    const collectionId = DriveCollectionId.forDrive(driveId, "main").key;
    const { opId, ordinal } = await deleteRow(childId);
    const left = await leftOrdinal(childId, collectionId);
    expect(left, `${childId} membership closed`).not.toBeNull();
    expect(ordinal, `${childId} delete before it leaves`).toBeLessThan(left!);
    return opId;
  }

  /** R holds drive N and doc k; N holds doc m; each drive has a remote. */
  async function nestedDrives(
    flags?: Partial<ReactorFeatureFlags>,
  ): Promise<void> {
    const {
      module: clientModule,
      reactorModule,
      sentTo,
    } = await build("in-process", flags);
    const { client } = clientModule;
    const r = driveDocumentModelModule.utils.createDocument();
    const n = driveDocumentModelModule.utils.createDocument();
    const R = r.header.id;
    const N = n.header.id;
    await client.create(r);
    await client.create(n, R);
    await client.create(createDocModelDocument({ id: "nested-k" }), R);
    await client.create(createDocModelDocument({ id: "nested-m" }), N);
    await addRemote(reactorModule, "remote-r", R, sentTo);
    await addRemote(reactorModule, "remote-n", N, sentTo);

    const outcome = await client
      .deleteDocument(R, PropagationMode.Cascade)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    const toR = [
      (await deleteRow(R)).opId,
      (await deleteRow(N)).opId,
      (await deleteRow("nested-k")).opId,
    ];
    const toN = [(await deleteRow("nested-m")).opId];
    await vi.waitUntil(
      () =>
        toR.every((id) => sentOpIds(sentTo("remote-r")).has(id)) &&
        toN.every((id) => sentOpIds(sentTo("remote-n")).has(id)),
      { timeout: 10_000 },
    );

    expect(outcome).toBeUndefined();
    await expectServedBeforeLeaving(N, R);
    await expectServedBeforeLeaving("nested-k", R);
    await expectServedBeforeLeaving("nested-m", N);
    const stream = await documentStream(N);
    expect(stream.at(-1)).toBe("DELETE_DOCUMENT");
    expect(stream).toContain("REMOVE_RELATIONSHIP:nested-m");
  }

  it("deletes nested drives, each delete served to its drive's remote", async () => {
    await nestedDrives();
  }, 60_000);

  it("deletes nested drives under document decisions", async () => {
    await nestedDrives(ENFORCING);
  }, 60_000);

  /** a -> b -> c, plain documents: no removal lands on a deleted source. */
  async function plainTree(
    flags?: Partial<ReactorFeatureFlags>,
  ): Promise<void> {
    const { module: clientModule, reactorModule } = await build(
      "in-process",
      flags,
    );
    const { client } = clientModule;
    await client.create(createDocModelDocument({ id: "plain-a" }));
    await client.create(createDocModelDocument({ id: "plain-b" }), "plain-a");
    await client.create(createDocModelDocument({ id: "plain-c" }), "plain-b");

    await client.deleteDocument("plain-a", PropagationMode.Cascade);

    for (const [source, target] of [
      ["plain-a", "plain-b"],
      ["plain-b", "plain-c"],
    ]) {
      const stream = await documentStream(source);
      expect(stream.at(-1), `${source} ends at its delete`).toBe(
        "DELETE_DOCUMENT",
      );
      expect(stream).toContain(`REMOVE_RELATIONSHIP:${target}`);
      const incoming = await reactorModule.documentIndexer.getIncoming(target);
      expect(incoming.results).toEqual([]);
    }
  }

  it("deletes a depth-2 tree of plain documents", async () => {
    await plainTree();
  }, 60_000);

  it("deletes a depth-2 tree of plain documents under document decisions", async () => {
    await plainTree(ENFORCING);
  }, 60_000);

  async function removedFile(
    flags?: Partial<ReactorFeatureFlags>,
  ): Promise<void> {
    const {
      module: clientModule,
      reactorModule,
      sentTo,
    } = await build("in-process", flags);
    const { client } = clientModule;
    const drive = driveDocumentModelModule.utils.createDocument();
    const driveId = drive.header.id;
    await client.create(drive);
    await client.drives.addFile(
      driveId,
      createDocModelDocument({ id: "removed-file" }),
    );
    await addRemote(reactorModule, "remote-d", driveId, sentTo);

    await client.drives.removeNode(driveId, "removed-file");

    const opId = await expectServedBeforeLeaving("removed-file", driveId);
    await vi.waitUntil(() => sentOpIds(sentTo("remote-d")).has(opId), {
      timeout: 10_000,
    });
    const reloaded = await client.get<DocumentDriveDocument>(driveId);
    expect(
      reloaded.state.global.nodes.find((node) => node.id === "removed-file"),
    ).toBeUndefined();
  }

  it("serves a removed file's delete to its drive's remote", async () => {
    await removedFile();
  }, 60_000);

  it("serves a removed file's delete under document decisions", async () => {
    await removedFile(ENFORCING);
  }, 60_000);

  it("serves every child's delete to the remote, in process", async () => {
    await runScenario("in-process");
  }, 60_000);

  it("serves every child's delete to the remote, under the worker pool", async () => {
    await runScenario("workers");
  }, 60_000);
});
