import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { type Database } from "@powerhousedao/reactor";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 5433;
const DEFAULT_USER = "postgres";
const DEFAULT_PASSWORD = "postgres";
const DEFAULT_ADMIN_DB = "postgres";
const DEFAULT_DOCKER_CONTAINER = "reactor-postgres";

export type PostgresTestConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

const DEFAULT_CONFIG: PostgresTestConfig = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  user: DEFAULT_USER,
  password: DEFAULT_PASSWORD,
};

function buildConnectionString(
  database: string,
  config: PostgresTestConfig = DEFAULT_CONFIG,
): string {
  const { host, port, user, password } = config;
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

export async function requireDockerComposePostgres(
  config: PostgresTestConfig = DEFAULT_CONFIG,
): Promise<void> {
  const adminPool = new Pool({
    connectionString: buildConnectionString(DEFAULT_ADMIN_DB, config),
    connectionTimeoutMillis: 2000,
  });

  try {
    await adminPool.query("SELECT 1");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      [
        `Postgres is not reachable at ${config.host}:${config.port} (${reason}).`,
        `Bring it up with:`,
        `  pnpm --filter @powerhousedao/reactor docker:up`,
        `Or set REACTOR_TEST_PG_HOST / REACTOR_TEST_PG_PORT to point at a different instance.`,
      ].join("\n"),
    );
  }

  await adminPool.end();
}

export async function createTestDatabase(
  name: string,
  config: PostgresTestConfig = DEFAULT_CONFIG,
): Promise<string> {
  const adminPool = new Pool({
    connectionString: buildConnectionString(DEFAULT_ADMIN_DB, config),
  });

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}"`);
    await adminPool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await adminPool.end();
  }

  return buildConnectionString(name, config);
}

export async function dropTestDatabase(
  name: string,
  config: PostgresTestConfig = DEFAULT_CONFIG,
): Promise<void> {
  const adminPool = new Pool({
    connectionString: buildConnectionString(DEFAULT_ADMIN_DB, config),
  });

  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await adminPool.end();
  }
}

function hostHasBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", [name], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

async function runHostPgRestore(
  connStr: string,
  dumpPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "pg_restore",
      [
        "--dbname",
        connStr,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        dumpPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`pg_restore exited with code ${code}.\nstderr:\n${stderr}`),
        );
      }
    });
  });
}

async function runDockerPgRestore(
  containerName: string,
  databaseName: string,
  dumpPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "pg_restore",
        "--username",
        DEFAULT_USER,
        "--dbname",
        databaseName,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `docker exec pg_restore exited with code ${code}.\nstderr:\n${stderr}`,
          ),
        );
      }
    });

    const dumpStream = createReadStream(dumpPath);
    dumpStream.on("error", reject);
    dumpStream.pipe(proc.stdin);
  });
}

export async function restoreFromDump(
  connStr: string,
  dumpPath: string,
  databaseName?: string,
): Promise<void> {
  if (!existsSync(dumpPath)) {
    throw new Error(
      [
        `Dump fixture not found at ${dumpPath}.`,
        `Capture one by running:`,
        `  PH_REACTOR_DATABASE_URL=<switchboard-pg-url> pnpm --filter @powerhousedao/reactor-api capture-hub-dump`,
      ].join("\n"),
    );
  }

  if (await hostHasBinary("pg_restore")) {
    await runHostPgRestore(connStr, dumpPath);
    return;
  }

  if (!databaseName) {
    throw new Error(
      "pg_restore not found on host and no databaseName provided for docker fallback.",
    );
  }

  const containerName =
    process.env.REACTOR_TEST_PG_DOCKER_CONTAINER ?? DEFAULT_DOCKER_CONTAINER;
  await runDockerPgRestore(containerName, databaseName, dumpPath);
}

export function createPostgresKysely(connStr: string): {
  kysely: Kysely<Database>;
  pool: Pool;
} {
  const pool = new Pool({ connectionString: connStr });
  const kysely = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
  return { kysely, pool };
}

/**
 * Removes all rows tied to documents marked deleted, from any reactor
 * table that references the document. The capture pipeline keeps these
 * rows so the dump faithfully mirrors production, but they break sync
 * (spokes can't apply ops to a doc that was deleted at the hub).
 */
export async function purgeDeletedDocuments(
  connStr: string,
): Promise<string[]> {
  const pool = new Pool({ connectionString: connStr });
  try {
    const result = await pool.query<{ documentId: string }>(
      `SELECT DISTINCT "documentId"
       FROM reactor."DocumentSnapshot"
       WHERE "isDeleted" = true`,
    );
    const ids = result.rows.map((r) => r.documentId);
    if (ids.length === 0) {
      return [];
    }

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.columns
       WHERE table_schema = 'reactor'
         AND column_name = 'documentId'`,
    );

    for (const row of tables.rows) {
      await pool.query(
        `DELETE FROM reactor."${row.table_name}" WHERE "documentId" = ANY($1::text[])`,
        [ids],
      );
    }

    return ids;
  } finally {
    await pool.end();
  }
}

type DerivedMetadataDoc = {
  id: string;
  documentType: string;
  slug: string | null;
};

type DerivedMetadataOpCount = {
  documentId: string;
  scope: string;
  branch: string;
  opCount: number;
  latestTimestampUtcMs: string | null;
};

export type DerivedFixtureMetadata = {
  capturedAt: string;
  sourceDescription: string;
  documents: DerivedMetadataDoc[];
  opCountsByDocScopeBranch: DerivedMetadataOpCount[];
  totalOpCount: number;
};

/**
 * Derives convergence metadata from the live test DB after restore + purge.
 * Returns only documents that belong to at least one live drive's collection
 * (or are themselves live drives), since spokes only subscribe via drive
 * remotes — anything outside a live drive's collection cannot converge.
 *
 * `driveType` selects which drive container type seeds the reachability set
 * (e.g. "powerhouse/document-drive" or "powerhouse/reactor-drive").
 */
export async function deriveFixtureMetadataFromDb(
  connStr: string,
  driveType: string = "powerhouse/document-drive",
): Promise<DerivedFixtureMetadata> {
  const pool = new Pool({ connectionString: connStr });
  try {
    const drives = await pool.query<{ documentId: string }>(
      `SELECT DISTINCT "documentId"
       FROM reactor."Operation"
       WHERE "documentType" = $1`,
      [driveType],
    );
    const driveCollectionIds = drives.rows.map(
      (r) => `drive.main.${r.documentId}`,
    );

    const reachableDocs = await pool.query<{ documentId: string }>(
      `SELECT DISTINCT "documentId"
       FROM reactor.document_collections
       WHERE "collectionId" = ANY($1::text[])`,
      [driveCollectionIds],
    );

    const reachable = new Set<string>([
      ...drives.rows.map((r) => r.documentId),
      ...reachableDocs.rows.map((r) => r.documentId),
    ]);

    const documents = await pool.query<{
      id: string;
      documentType: string;
      slug: string | null;
    }>(
      `SELECT DISTINCT
         o."documentId" AS id,
         o."documentType" AS "documentType",
         sm.slug
       FROM reactor."Operation" o
       LEFT JOIN reactor."SlugMapping" sm
         ON sm."documentId" = o."documentId"
        AND sm.scope = o.scope
        AND sm.branch = o.branch
       WHERE o."documentId" = ANY($1::text[])
       ORDER BY id`,
      [Array.from(reachable)],
    );

    const opCounts = await pool.query<{
      documentId: string;
      scope: string;
      branch: string;
      opCount: string;
      latestTimestampUtcMs: string | null;
    }>(
      `SELECT
         "documentId",
         scope,
         branch,
         COUNT(*)::text AS "opCount",
         MAX("timestampUtcMs") AS "latestTimestampUtcMs"
       FROM reactor."Operation"
       WHERE "documentId" = ANY($1::text[])
       GROUP BY "documentId", scope, branch
       ORDER BY "documentId", scope, branch`,
      [Array.from(reachable)],
    );

    const totalOps = opCounts.rows.reduce(
      (acc, row) => acc + Number(row.opCount),
      0,
    );

    return {
      capturedAt: new Date().toISOString(),
      sourceDescription: `derived from ${connStr.replace(/:[^@]*@/, ":***@")}`,
      documents: documents.rows.map((row) => ({
        id: row.id,
        documentType: row.documentType,
        slug: row.slug ?? null,
      })),
      opCountsByDocScopeBranch: opCounts.rows.map((row) => ({
        documentId: row.documentId,
        scope: row.scope,
        branch: row.branch,
        opCount: Number(row.opCount),
        latestTimestampUtcMs: row.latestTimestampUtcMs,
      })),
      totalOpCount: totalOps,
    };
  } finally {
    await pool.end();
  }
}

export function readPostgresTestConfigFromEnv(): PostgresTestConfig {
  return {
    host: process.env.REACTOR_TEST_PG_HOST ?? DEFAULT_HOST,
    port: process.env.REACTOR_TEST_PG_PORT
      ? Number(process.env.REACTOR_TEST_PG_PORT)
      : DEFAULT_PORT,
    user: process.env.REACTOR_TEST_PG_USER ?? DEFAULT_USER,
    password: process.env.REACTOR_TEST_PG_PASSWORD ?? DEFAULT_PASSWORD,
  };
}
