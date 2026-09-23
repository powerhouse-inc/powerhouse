import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  setModelName,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { vi } from "vitest";
import {
  ReactorBuilder,
  type ReadModelFactory,
} from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type {
  Database,
  InProcessReactorClientModule,
  InProcessReactorModule,
  IReactor,
} from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type { SyncBuilder } from "../../src/sync/sync-builder.js";
import { createDocModelDocument } from "../factories.js";

export const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

export const DRIVE_TYPE = "powerhouse/document-drive";

export type BuildOptions = {
  kysely?: Kysely<Database>;
  sync?: SyncBuilder;
  featureFlags?: Partial<ReactorFeatureFlags>;
  readModelFactories?: ReadModelFactory[];
};

function reactorBuilder(options: BuildOptions): ReactorBuilder {
  const builder = new ReactorBuilder()
    .withDocumentModelSources([
      driveDocumentModelModule as never,
      documentModelDocumentModelModule as never,
    ])
    .withExecutorConfig({ featureFlags: options.featureFlags ?? {} });
  if (options.kysely) builder.withKysely(options.kysely);
  if (options.sync) builder.withSync(options.sync);
  for (const factory of options.readModelFactories ?? []) {
    builder.withReadModelFactory(factory);
  }
  return builder;
}

export async function buildReactor(
  options: BuildOptions = {},
): Promise<InProcessReactorModule> {
  return reactorBuilder(options).buildModule();
}

/** A reactor with its client, for the client-level cascade. */
export async function buildClient(
  options: BuildOptions = {},
): Promise<InProcessReactorClientModule> {
  return new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder(options))
    .buildModule();
}

/** Resolves with the job once it is READ_READY or FAILED. */
export async function settle(
  reactor: IReactor,
  job: JobInfo,
  timeout = 10_000,
): Promise<JobInfo> {
  let info = job;
  await vi.waitUntil(
    async () => {
      info = await reactor.getJobStatus(job.id);
      return (
        info.status === JobStatus.READ_READY || info.status === JobStatus.FAILED
      );
    },
    { timeout, interval: 10 },
  );
  return info;
}

export async function expectReady(
  reactor: IReactor,
  job: JobInfo,
): Promise<JobInfo> {
  const info = await settle(reactor, job);
  if (info.status !== JobStatus.READ_READY) {
    throw new Error(
      `job ${job.id} ended ${info.status}: ${info.error?.message ?? "no error"}`,
    );
  }
  return info;
}

export async function createDrive(
  module: InProcessReactorModule,
  id: string,
): Promise<void> {
  const document = driveDocumentModelModule.utils.createDocument();
  document.header.id = id;
  await expectReady(module.reactor, await module.reactor.create(document));
}

export async function createDocument(
  module: InProcessReactorModule,
  id: string,
): Promise<void> {
  await expectReady(
    module.reactor,
    await module.reactor.create(createDocModelDocument({ id })),
  );
}

export async function addChild(
  module: InProcessReactorModule,
  parentId: string,
  childId: string,
): Promise<void> {
  await expectReady(
    module.reactor,
    await module.reactor.addRelationship(parentId, childId, "child"),
  );
}

export async function removeChild(
  module: InProcessReactorModule,
  parentId: string,
  childId: string,
): Promise<void> {
  await expectReady(
    module.reactor,
    await module.reactor.removeRelationship(parentId, childId, "child"),
  );
}

export async function deleteDocument(
  module: InProcessReactorModule,
  id: string,
): Promise<void> {
  await expectReady(module.reactor, await module.reactor.deleteDocument(id));
}

export async function renameDocument(
  module: InProcessReactorModule,
  id: string,
  name: string,
): Promise<void> {
  await expectReady(
    module.reactor,
    await module.reactor.execute(id, "main", [setModelName({ name })]),
  );
}

/** Every stored operation of a document, all scopes, in index order. */
export async function storedOperations(
  module: InProcessReactorModule,
  id: string,
): Promise<Record<string, Operation[]>> {
  const byScope: Record<string, Operation[]> = {};
  const rows = await module.database
    .selectFrom("Operation")
    .selectAll()
    .where("documentId", "=", id)
    .orderBy("scope")
    .orderBy("index")
    .execute();
  for (const row of rows) {
    (byScope[row.scope] ??= []).push({
      id: row.opId,
      index: row.index,
      skip: row.skip,
      hash: row.hash,
      timestampUtcMs: row.timestampUtcMs.toISOString(),
      action: row.action as Operation["action"],
      ...(row.deniedReason ? { deniedReason: row.deniedReason } : {}),
    });
  }
  return byScope;
}

/** How many rows every reactor-schema table holds about the id. */
export async function rowsAbout(
  db: Kysely<Database>,
  id: string,
): Promise<Record<string, number>> {
  const count = async (
    query: Promise<{ n: string | number | bigint } | undefined>,
  ) => Number((await query)?.n ?? 0);

  return {
    Operation: await count(
      db
        .selectFrom("Operation")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    operation_index_operations: await count(
      db
        .selectFrom("operation_index_operations")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    Keyframe: await count(
      db
        .selectFrom("Keyframe")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    DocumentSnapshot: await count(
      db
        .selectFrom("DocumentSnapshot")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    SlugMapping: await count(
      db
        .selectFrom("SlugMapping")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    Document: await count(
      db
        .selectFrom("Document")
        .select(sql<number>`count(*)`.as("n"))
        .where("id", "=", id)
        .executeTakeFirst(),
    ),
    DocumentRelationship: await count(
      db
        .selectFrom("DocumentRelationship")
        .select(sql<number>`count(*)`.as("n"))
        .where((eb) =>
          eb.or([eb("sourceId", "=", id), eb("targetId", "=", id)]),
        )
        .executeTakeFirst(),
    ),
    document_collections: await count(
      db
        .selectFrom("document_collections")
        .select(sql<number>`count(*)`.as("n"))
        .where((eb) =>
          eb.or([
            eb("documentId", "=", id),
            eb("collectionId", "like", `drive.%.${id}`),
          ]),
        )
        .executeTakeFirst(),
    ),
    group_references: await count(
      db
        .selectFrom("group_references")
        .select(sql<number>`count(*)`.as("n"))
        .where("documentId", "=", id)
        .executeTakeFirst(),
    ),
    sync_dead_letters: await count(
      db
        .selectFrom("sync_dead_letters")
        .select(sql<number>`count(*)`.as("n"))
        .where("document_id", "=", id)
        .executeTakeFirst(),
    ),
    ProcessorCursor: await count(
      db
        .selectFrom("ProcessorCursor")
        .select(sql<number>`count(*)`.as("n"))
        .where("driveId", "=", id)
        .executeTakeFirst(),
    ),
  };
}

export function emptyRows(): Record<string, number> {
  return {
    Operation: 0,
    operation_index_operations: 0,
    Keyframe: 0,
    DocumentSnapshot: 0,
    SlugMapping: 0,
    Document: 0,
    DocumentRelationship: 0,
    document_collections: 0,
    group_references: 0,
    sync_dead_letters: 0,
    ProcessorCursor: 0,
  };
}

/** A database of its own: the reactor hardcodes its schema. */
export async function createPostgresDatabase(name: string): Promise<{
  kysely: Kysely<Database>;
  url: string;
  drop: () => Promise<void>;
}> {
  const admin = new Pool({ connectionString: PG_TEST_URL });
  const database = `${name}_${process.pid}`;
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);

  const url = new URL(PG_TEST_URL);
  url.pathname = `/${database}`;
  const kysely = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url.toString(), max: 10 }),
    }),
  });

  return {
    kysely,
    url: url.toString(),
    drop: async () => {
      try {
        await kysely.destroy();
      } catch {
        // already destroyed by the reactor
      }
      try {
        await admin.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [database],
        );
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      } finally {
        await admin.end();
      }
    },
  };
}
