import {
  GqlResponseChannelFactory,
  JobStatus,
  ReactorBuilder,
  SyncBuilder,
  type Database,
  type IEventBus,
  type InProcessReactorModule,
  type JobInfo,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { vi } from "vitest";

export const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

export type TestDatabase = {
  url: string;
  connect(): Kysely<Database>;
  drop(): Promise<void>;
};

function connect(url: string): Kysely<Database> {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/** A fresh database per suite: the reactor schema name is fixed. */
export async function createTestDatabase(name: string): Promise<TestDatabase> {
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(PG_TEST_URL);
  url.pathname = `/${name}`;
  const handles: Kysely<Database>[] = [];
  return {
    url: url.toString(),
    connect() {
      const handle = connect(url.toString());
      handles.push(handle);
      return handle;
    },
    async drop() {
      try {
        for (const handle of handles) await handle.destroy();
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    },
  };
}

export type TestReactor = {
  module: InProcessReactorModule;
  db: Kysely<Database>;
  kill(): Promise<void>;
};

export async function startReactor(
  database: TestDatabase,
  options: {
    signer?: ISigner;
    eventBus?: IEventBus;
    sweepIntervalMs?: number;
    /** Serves remotes over polling channels, as switchboard does for Connect. */
    sync?: boolean;
    maxPurgeOperations?: number;
  },
): Promise<TestReactor> {
  const db = database.connect();
  const builder = new ReactorBuilder()
    .withKysely(db)
    .withDocumentModelSources([
      driveDocumentModelModule as never,
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ]);
  if (options.signer) builder.withSigner(options.signer);
  if (options.maxPurgeOperations !== undefined) {
    builder.withExecutorConfig({
      maxPurgeOperations: options.maxPurgeOperations,
    });
  }
  if (options.sync) {
    builder.withSync(
      new SyncBuilder().withChannelFactory(
        new GqlResponseChannelFactory(silentLogger() as never),
      ),
    );
  }
  if (options.eventBus) builder.withEventBus(options.eventBus);
  if (options.sweepIntervalMs !== undefined) {
    builder.withCatchUp({ intervalMs: options.sweepIntervalMs });
  }
  const module = await builder.buildModule();
  return {
    module,
    db,
    async kill() {
      await module.reactor.kill().completed;
      await module.syncModule?.syncManager.shutdown().completed;
    },
  };
}

function silentLogger() {
  const logger = {
    verbose() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    child: () => logger,
  };
  return logger;
}

export async function settled(
  module: InProcessReactorModule,
  jobId: string,
): Promise<JobInfo> {
  let info: JobInfo | undefined;
  await vi.waitUntil(
    async () => {
      info = await module.reactor.getJobStatus(jobId);
      return (
        info.status === JobStatus.FAILED || info.status === JobStatus.READ_READY
      );
    },
    { timeout: 20_000, interval: 20 },
  );
  if (info!.status === JobStatus.FAILED) {
    throw new Error(
      `job ${jobId} failed: ${info!.error?.name}: ${info!.error?.message}`,
    );
  }
  return info!;
}
