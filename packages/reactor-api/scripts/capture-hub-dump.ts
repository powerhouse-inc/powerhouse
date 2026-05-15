/**
 * Capture script for the hub-spoke catch-up integration test fixture.
 *
 * Reads a Postgres connection string from PH_REACTOR_DATABASE_URL (or first arg),
 * runs `pg_dump` against the `reactor` schema, and writes a drive-type-specific
 * pair of files under test/fixtures/:
 *   - hub-large-doc.dump / hub-large-doc.fixture.json
 *     (default; for powerhouse/document-drive)
 *   - hub-large-doc-reactor-drive.dump / hub-large-doc-reactor-drive.fixture.json
 *     (when --drive-type powerhouse/reactor-drive)
 *
 * Usage:
 *   PH_REACTOR_DATABASE_URL=postgres://user:pass@host:5432/reactor \
 *     pnpm --filter @powerhousedao/reactor-api capture-hub-dump
 *
 *   # Reactor-drive variant:
 *   PH_REACTOR_DATABASE_URL=postgres://... \
 *     pnpm --filter @powerhousedao/reactor-api capture-hub-dump \
 *       --drive-type powerhouse/reactor-drive
 *
 * Or pass the URL as the first positional arg:
 *   pnpm --filter @powerhousedao/reactor-api capture-hub-dump postgres://...
 *
 * If `pg_dump` is not installed on the host, capture the dump via docker exec
 * and re-run with SKIP_DUMP=1 to write only the metadata sidecar:
 *   docker exec <pg-container> pg_dump --schema=reactor --format=custom \
 *     --no-owner --no-acl -U postgres -d <db> > test/fixtures/hub-large-doc.dump
 *   SKIP_DUMP=1 PH_REACTOR_DATABASE_URL=<url> pnpm capture-hub-dump
 *
 * Refresh policy: rerun this script when you want to update the regression
 * fixture against a fresh switchboard state. Commit both output files.
 */

import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

type DocOpRow = {
  documentId: string;
  scope: string;
  branch: string;
  opCount: string;
  latestTimestampUtcMs: string | null;
};

type DocumentRow = {
  id: string;
  documentType: string;
  slug: string | null;
};

type FixtureMetadata = {
  capturedAt: string;
  sourceDescription: string;
  documents: Array<{
    id: string;
    documentType: string;
    slug: string | null;
  }>;
  opCountsByDocScopeBranch: Array<{
    documentId: string;
    scope: string;
    branch: string;
    opCount: number;
    latestTimestampUtcMs: string | null;
  }>;
  totalOpCount: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../test/fixtures");

const FIXTURE_NAMES = {
  "powerhouse/document-drive": {
    dump: "hub-large-doc.dump",
    metadata: "hub-large-doc.fixture.json",
  },
  "powerhouse/reactor-drive": {
    dump: "hub-large-doc-reactor-drive.dump",
    metadata: "hub-large-doc-reactor-drive.fixture.json",
  },
} as const;

type CaptureDriveType = keyof typeof FIXTURE_NAMES;

function parseDriveType(argv: string[]): CaptureDriveType {
  const idx = argv.indexOf("--drive-type");
  if (idx === -1) return "powerhouse/document-drive";

  const value = argv[idx + 1];
  if (!value || !(value in FIXTURE_NAMES)) {
    throw new Error(
      `--drive-type must be one of: ${Object.keys(FIXTURE_NAMES).join(", ")}`,
    );
  }
  return value as CaptureDriveType;
}

function readConnectionString(): string {
  const argv = process.argv.slice(2).filter((arg, i, arr) => {
    if (arg === "--drive-type") return false;
    if (arr[i - 1] === "--drive-type") return false;
    return true;
  });
  const fromArg = argv[0];
  const fromEnv = process.env.PH_REACTOR_DATABASE_URL;
  const connStr = fromArg ?? fromEnv;

  if (!connStr) {
    throw new Error(
      "Connection string required. Set PH_REACTOR_DATABASE_URL or pass as first arg.",
    );
  }

  if (
    !connStr.startsWith("postgres://") &&
    !connStr.startsWith("postgresql://")
  ) {
    throw new Error(
      `Connection string must be a real Postgres URL (got: ${connStr}). PGlite paths are not supported.`,
    );
  }

  return connStr;
}

function runPgDump(connStr: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      [
        "--schema=reactor",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        outputPath,
        connStr,
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
          new Error(`pg_dump exited with code ${code}.\nstderr:\n${stderr}`),
        );
      }
    });
  });
}

async function readMetadata(connStr: string): Promise<FixtureMetadata> {
  const pool = new Pool({ connectionString: connStr });

  try {
    const deletedRows = await pool.query<{ documentId: string }>(
      `SELECT DISTINCT "documentId"
       FROM reactor."DocumentSnapshot"
       WHERE "isDeleted" = true`,
    );
    const deletedIds = new Set(deletedRows.rows.map((r) => r.documentId));

    const documents = await pool.query<DocumentRow>(
      `SELECT DISTINCT
         o."documentId" AS id,
         o."documentType" AS "documentType",
         sm.slug
       FROM reactor."Operation" o
       LEFT JOIN reactor."SlugMapping" sm
         ON sm."documentId" = o."documentId"
        AND sm.scope = o.scope
        AND sm.branch = o.branch
       ORDER BY id`,
    );

    const opCounts = await pool.query<DocOpRow>(
      `SELECT
         "documentId",
         scope,
         branch,
         COUNT(*)::text AS "opCount",
         MAX("timestampUtcMs") AS "latestTimestampUtcMs"
       FROM reactor."Operation"
       GROUP BY "documentId", scope, branch
       ORDER BY "documentId", scope, branch`,
    );

    const liveDocuments = documents.rows.filter(
      (row) => !deletedIds.has(row.id),
    );
    const liveOpCounts = opCounts.rows.filter(
      (row) => !deletedIds.has(row.documentId),
    );
    const totalOps = liveOpCounts.reduce(
      (acc, row) => acc + Number(row.opCount),
      0,
    );

    if (deletedIds.size > 0) {
      console.log(
        `excluded ${deletedIds.size} deleted document(s) from metadata (their ops remain in the dump)`,
      );
    }

    return {
      capturedAt: new Date().toISOString(),
      sourceDescription: maskConnectionString(connStr),
      documents: liveDocuments.map((row) => ({
        id: row.id,
        documentType: row.documentType,
        slug: row.slug ?? null,
      })),
      opCountsByDocScopeBranch: liveOpCounts.map((row) => ({
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

function maskConnectionString(connStr: string): string {
  try {
    const url = new URL(connStr);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(unparseable connection string)";
  }
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

async function main(): Promise<void> {
  const driveType = parseDriveType(process.argv);
  const connStr = readConnectionString();
  const skipDump = process.env.SKIP_DUMP === "1";

  const dumpPath = path.join(FIXTURES_DIR, FIXTURE_NAMES[driveType].dump);
  const metadataPath = path.join(
    FIXTURES_DIR,
    FIXTURE_NAMES[driveType].metadata,
  );

  mkdirSync(FIXTURES_DIR, { recursive: true });

  console.log(`Drive type: ${driveType}`);

  if (skipDump) {
    console.log(
      `SKIP_DUMP=1 set; reusing existing dump at ${path.relative(process.cwd(), dumpPath)} (host pg_dump skipped — use docker exec to refresh).`,
    );
  } else {
    console.log(
      `Capturing reactor schema dump from ${maskConnectionString(connStr)}`,
    );
    await runPgDump(connStr, dumpPath);
  }

  const metadata = await readMetadata(connStr);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  const dumpSize = statSync(dumpPath).size;
  console.log(
    `captured ${metadata.totalOpCount} ops across ${metadata.documents.length} docs to ${path.relative(process.cwd(), dumpPath)} (${formatBytes(dumpSize)})`,
  );
  console.log(
    `metadata sidecar: ${path.relative(process.cwd(), metadataPath)}`,
  );

  if (dumpSize > 25 * 1024 * 1024) {
    console.warn(
      `WARNING: dump size exceeds 25 MB. Consider Git LFS or external-file mode before committing.`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
