import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
  type DocumentModelModule,
  type ISigner,
  type Operation,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { expect, vi } from "vitest";
import type { DocumentPurgeService } from "../../../src/admin/document-purge-service.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type {
  Database,
  InProcessReactorModule,
  IReactor,
} from "../../../src/core/types.js";
import type {
  JobExecutorConfig,
  ReactorFeatureFlags,
} from "../../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../../src/shared/types.js";
import type { SignatureTrustPolicy } from "../../../src/signer/types.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";

export const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

/** Every table the spec's delete list names, with the column keying the id. */
export const DELETE_LIST: ReadonlyArray<[table: string, column: string]> = [
  ["Operation", "documentId"],
  ["operation_index_operations", "documentId"],
  ["Keyframe", "documentId"],
  ["DocumentSnapshot", "documentId"],
  ["SlugMapping", "documentId"],
  ["Document", "id"],
  ["group_references", "documentId"],
  ["sync_dead_letters", "document_id"],
  ["sync_holds", "document_id"],
];

/** A drive whose unsigned actions a legacy policy admits. */
export function legacyDrive(): PHDocument {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id: generateId() },
  );
}

export type TestDatabase = {
  name: string;
  url: string;
  base: Kysely<Database>;
  drop(): Promise<void>;
};

async function waitForNoBackends(admin: Pool, name: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1",
      [name],
    );
    if (rows[0].count === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** A fresh database per test file: the reactor schema name is fixed. */
export async function createTestDatabase(name: string): Promise<TestDatabase> {
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const base = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return {
    name,
    url: url.toString(),
    base,
    async drop() {
      try {
        await base.destroy();
      } finally {
        // pool.end() resolves before backends exit; FORCE would 57P01 them.
        await waitForNoBackends(admin, name);
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

export type PurgeReactor = {
  module: InProcessReactorModule;
  reactor: IReactor;
  db: Kysely<StorageDatabase>;
  service: DocumentPurgeService;
  kill(): Promise<void>;
};

export type PurgeReactorOptions = {
  signer?: ISigner;
  featureFlags?: Partial<ReactorFeatureFlags>;
  executorConfig?: Partial<JobExecutorConfig>;
  trustPolicy?: SignatureTrustPolicy;
  models?: DocumentModelModule[];
};

export async function startReactor(
  database: TestDatabase,
  options: PurgeReactorOptions = {},
): Promise<PurgeReactor> {
  const builder = new ReactorBuilder()
    .withKysely(database.base)
    .withDocumentModelSources([
      documentModelDocumentModelModule as never,
      driveDocumentModelModule as never,
      ...((options.models ?? []) as never[]),
    ])
    .withExecutorConfig({
      ...options.executorConfig,
      featureFlags: options.featureFlags,
    });
  if (options.signer) {
    builder.withSigner(options.signer);
  }
  if (options.trustPolicy) {
    builder.withTrustPolicy(options.trustPolicy);
  }
  const module = await builder.buildModule();
  return {
    module,
    reactor: module.reactor,
    db: module.database as unknown as Kysely<StorageDatabase>,
    service: module.documentPurgeService,
    async kill() {
      await module.reactor.kill().completed;
    },
  };
}

/** Waits for a terminal status and returns it, failed or not. */
export async function settled(
  reactor: IReactor,
  jobId: string,
): Promise<JobInfo> {
  let info: JobInfo | undefined;
  await vi.waitUntil(
    async () => {
      info = await reactor.getJobStatus(jobId);
      return (
        info.status === JobStatus.FAILED || info.status === JobStatus.READ_READY
      );
    },
    { timeout: 20_000, interval: 20 },
  );
  return info!;
}

export async function succeeded(
  reactor: IReactor,
  jobId: string,
): Promise<JobInfo> {
  const info = await settled(reactor, jobId);
  if (info.status === JobStatus.FAILED) {
    throw new Error(
      `job ${jobId} failed: ${info.error?.name}: ${info.error?.message}`,
    );
  }
  return info;
}

/** A terminal failure: the named error, and no retry spent on it. */
export async function failedWith(
  reactor: IReactor,
  jobId: string,
  name: string,
): Promise<JobInfo> {
  const info = await settled(reactor, jobId);
  expect(info.status).toBe(JobStatus.FAILED);
  expect(info.error?.name).toBe(name);
  expect(info.job?.retryCount ?? 0).toBe(0);
  return info;
}

export async function rowCount(
  db: Kysely<StorageDatabase>,
  table: string,
  column: string,
  documentId: string,
): Promise<number> {
  const row = await (db as Kysely<any>)
    .selectFrom(table)
    .select((eb) => eb.fn.countAll().as("count"))
    .where(column, "=", documentId)
    .executeTakeFirst();
  return Number((row as { count: string | number } | undefined)?.count ?? 0);
}

/** Row counts of the delete list for an id, keyed by table. */
export async function deleteListCounts(
  db: Kysely<StorageDatabase>,
  documentId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, column] of DELETE_LIST) {
    counts[table] = await rowCount(db, table, column, documentId);
  }
  counts.DocumentRelationship = Number(
    (
      (await (db as Kysely<any>)
        .selectFrom("DocumentRelationship")
        .select((eb) => eb.fn.countAll().as("count"))
        .where((eb) =>
          eb.or([
            eb("sourceId", "=", documentId),
            eb("targetId", "=", documentId),
          ]),
        )
        .executeTakeFirst()) as { count: string | number }
    ).count,
  );
  return counts;
}

/** A purge stuck: nothing left in the delete list but the marker and its twin. */
export async function expectPurged(
  db: Kysely<StorageDatabase>,
  documentId: string,
): Promise<Operation> {
  const counts = await deleteListCounts(db, documentId);
  expect(counts).toEqual({
    Operation: 1,
    operation_index_operations: 1,
    Keyframe: 0,
    DocumentSnapshot: 0,
    SlugMapping: 0,
    Document: 0,
    group_references: 0,
    sync_dead_letters: 0,
    sync_holds: 0,
    DocumentRelationship: 0,
  });
  const [row] = await db
    .selectFrom("Operation")
    .selectAll()
    .where("documentId", "=", documentId)
    .execute();
  expect(row).toMatchObject({
    scope: "document",
    branch: "main",
    index: 0,
    skip: 0,
    hash: "",
  });
  const action = row.action as Operation["action"];
  expect(action.type).toBe("PURGE_DOCUMENT");
  expect(row.timestampUtcMs.toISOString()).toBe(action.timestampUtcMs);
  const tombstone = await db
    .selectFrom("document_purges")
    .selectAll()
    .where("documentId", "=", documentId)
    .executeTakeFirst();
  expect(tombstone).toBeDefined();
  return {
    id: row.opId,
    index: row.index,
    skip: row.skip,
    hash: row.hash,
    timestampUtcMs: row.timestampUtcMs.toISOString(),
    action,
  };
}

/** Nothing about the id anywhere in the delete list, and no tombstone. */
export async function expectUntouched(
  db: Kysely<StorageDatabase>,
  documentId: string,
  before: Record<string, number>,
): Promise<void> {
  expect(await deleteListCounts(db, documentId)).toEqual(before);
  expect(await rowCount(db, "document_purges", "documentId", documentId)).toBe(
    0,
  );
}
