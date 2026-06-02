/**
 * Conversion script for the hub-spoke catch-up integration test fixture.
 *
 * Takes a `powerhouse/document-drive` dump and produces an equivalent
 * `powerhouse/reactor-drive` dump via forward replay through reactor APIs.
 *
 * For each legacy drive in the source dump:
 *   1. Read its state (name, icon, sharingType, availableOffline, nodes).
 *   2. Delete the drive document (soft-delete + relationship cleanup).
 *   3. After all drives are deleted, hard-purge their rows from the DB.
 *   4. Recreate as a `powerhouse/reactor-drive` document with the same id.
 *   5. Replay folder/file structure via `migrateLegacyDriveState`
 *      (folders -> ADD_FOLDER, files -> ADD_RELATIONSHIP drive/child).
 *
 * Child PHDocuments (e.g. knowledge-notes) are left untouched in the DB;
 * the reactor-drive container relinks to them by id.
 *
 * Usage:
 *   pnpm --filter @powerhousedao/reactor-api convert-hub-dump \
 *     [--source <path>] [--output <path>] [--metadata <path>]
 *
 * Defaults:
 *   --source    test/fixtures/hub-large-doc.dump
 *   --output    test/fixtures/hub-large-doc-reactor-drive.dump
 *   --metadata  test/fixtures/hub-large-doc-reactor-drive.fixture.json
 *
 * Requires Docker Postgres reachable at REACTOR_TEST_PG_* (defaults to
 * localhost:5433 via `pnpm --filter @powerhousedao/reactor docker:up`).
 */

import {
  ReactorClientBuilder,
  type IReactorClient,
} from "@powerhousedao/reactor";
import {
  migrateLegacyDriveState,
  reactorDriveCreateDocument,
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
  type IDriveReadModel,
  type ReactorDriveNode,
} from "@powerhousedao/reactor-drive";
import type {
  DocumentDrivePHState,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { buildHubModule } from "../test/utils/hub-spoke-helpers.js";
import {
  createPostgresKysely,
  createTestDatabase,
  dropTestDatabase,
  purgeDeletedDocuments,
  readPostgresTestConfigFromEnv,
  requireDockerComposePostgres,
  restoreFromDump,
} from "../test/utils/postgres-test-db.js";

const DOCUMENT_DRIVE_TYPE = "powerhouse/document-drive";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../test/fixtures");

const DEFAULT_SOURCE = path.join(FIXTURES_DIR, "hub-large-doc.dump");
const DEFAULT_OUTPUT = path.join(
  FIXTURES_DIR,
  "hub-large-doc-reactor-drive.dump",
);
const DEFAULT_METADATA = path.join(
  FIXTURES_DIR,
  "hub-large-doc-reactor-drive.fixture.json",
);

const REACTOR_DRIVE_DEFAULT_SHARING_TYPE = "private";
const REACTOR_DRIVE_DEFAULT_AVAILABLE_OFFLINE = false;

type ScriptArgs = {
  source: string;
  output: string;
  metadata: string;
};

type LegacyDriveSnapshot = {
  id: string;
  name: string;
  icon: string | null;
  sharingType: string;
  availableOffline: boolean;
  nodes: Node[];
};

type MetadataDoc = {
  id: string;
  documentType: string;
  slug: string | null;
};

type MetadataOpCount = {
  documentId: string;
  scope: string;
  branch: string;
  opCount: number;
  latestTimestampUtcMs: string | null;
};

type FixtureMetadata = {
  capturedAt: string;
  sourceDescription: string;
  documents: MetadataDoc[];
  opCountsByDocScopeBranch: MetadataOpCount[];
  totalOpCount: number;
};

function parseArgs(argv: string[]): ScriptArgs {
  let source = DEFAULT_SOURCE;
  let output = DEFAULT_OUTPUT;
  let metadata: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--source") {
      if (!next) throw new Error("--source requires a path argument");
      source = path.resolve(next);
      i++;
    } else if (arg === "--output") {
      if (!next) throw new Error("--output requires a path argument");
      output = path.resolve(next);
      i++;
    } else if (arg === "--metadata") {
      if (!next) throw new Error("--metadata requires a path argument");
      metadata = path.resolve(next);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!metadata) {
    metadata =
      output.endsWith(".dump") && output !== DEFAULT_OUTPUT
        ? output.replace(/\.dump$/, ".fixture.json")
        : DEFAULT_METADATA;
  }

  return { source, output, metadata };
}

function printHelpAndExit(): never {
  console.log(
    [
      "Usage: convert-hub-dump [--source <path>] [--output <path>] [--metadata <path>]",
      "",
      "  --source    path to a powerhouse/document-drive pg_dump (default: test/fixtures/hub-large-doc.dump)",
      "  --output    path to write the converted reactor-drive dump (default: test/fixtures/hub-large-doc-reactor-drive.dump)",
      "  --metadata  path to write the metadata sidecar (default: derived from --output)",
    ].join("\n"),
  );
  process.exit(0);
}

/**
 * Stub read model used by `migrateLegacyDriveState`. The conversion always
 * runs against a freshly recreated drive container, so no existing nodes
 * can interfere — the migration helper only consults `getNode`, so we
 * always report "absent" and let it emit every action.
 */
class EmptyDriveReadModel implements IDriveReadModel {
  getNode(): Promise<ReactorDriveNode | undefined> {
    return Promise.resolve(undefined);
  }
  listChildren(): Promise<never> {
    throw new Error("listChildren is not used during conversion");
  }
  getDescendants(): Promise<never> {
    throw new Error("getDescendants is not used during conversion");
  }
  listAll(): Promise<never> {
    throw new Error("listAll is not used during conversion");
  }
}

async function readLegacyDriveIds(connStr: string): Promise<string[]> {
  const pool = new Pool({ connectionString: connStr });
  try {
    const result = await pool.query<{ documentId: string }>(
      `SELECT DISTINCT "documentId"
       FROM reactor."Operation"
       WHERE "documentType" = $1
       ORDER BY "documentId"`,
      [DOCUMENT_DRIVE_TYPE],
    );
    return result.rows.map((r) => r.documentId);
  } finally {
    await pool.end();
  }
}

async function snapshotLegacyDrives(
  client: IReactorClient,
  driveIds: string[],
  logger: ConsoleLogger,
): Promise<LegacyDriveSnapshot[]> {
  const snapshots: LegacyDriveSnapshot[] = [];
  for (const id of driveIds) {
    const doc = await client.get<PHDocument<DocumentDrivePHState>>(id);
    const state = doc.state;
    const sharingType =
      state.local.sharingType ?? REACTOR_DRIVE_DEFAULT_SHARING_TYPE;
    snapshots.push({
      id,
      name: state.global.name,
      icon: state.global.icon ?? null,
      sharingType,
      availableOffline: state.local.availableOffline,
      nodes: state.global.nodes,
    });
    logger.info(
      `snapshotted drive ${id} ("${state.global.name}"): ${state.global.nodes.length} node(s)`,
    );
  }
  return snapshots;
}

async function deleteLegacyDrives(
  client: IReactorClient,
  driveIds: string[],
  logger: ConsoleLogger,
): Promise<void> {
  for (const id of driveIds) {
    await client.deleteDocument(id);
    logger.info(`deleted legacy drive ${id}`);
  }
}

function buildPostDriveActions(snap: LegacyDriveSnapshot): Action[] {
  const actions: Action[] = [];
  if (snap.sharingType !== REACTOR_DRIVE_DEFAULT_SHARING_TYPE) {
    actions.push(setSharingTypeAction({ sharingType: snap.sharingType }));
  }
  if (snap.availableOffline !== REACTOR_DRIVE_DEFAULT_AVAILABLE_OFFLINE) {
    actions.push(
      setAvailableOfflineAction({ availableOffline: snap.availableOffline }),
    );
  }
  return actions;
}

async function rebuildAsReactorDrives(
  client: IReactorClient,
  snapshots: LegacyDriveSnapshot[],
  logger: ConsoleLogger,
): Promise<void> {
  const readModel = new EmptyDriveReadModel();

  for (const snap of snapshots) {
    const doc = reactorDriveCreateDocument({
      global: { name: snap.name, icon: snap.icon },
      local: {
        sharingType: snap.sharingType,
        availableOffline: snap.availableOffline,
      },
    });
    doc.header.id = snap.id;

    await client.create(doc);
    logger.info(`created reactor-drive ${snap.id} ("${snap.name}")`);

    // `reactorDriveCreateState` seeds the initial state from the input, so
    // global.name / global.icon are already correct after create(). The
    // local-scope defaults from the legacy drive could still differ — emit
    // setters only when they diverge from reactor-drive's defaults.
    //
    // We still emit setDriveName / setDriveIcon explicitly so the
    // operation history contains the canonical mutation events; spokes
    // replaying these ops produce the same final state without depending
    // on the initial-state plumbing during create().
    const driveScopeActions: Action[] = [
      setDriveNameAction({ name: snap.name }),
      setDriveIconAction({ icon: snap.icon }),
    ];
    await client.execute(snap.id, "main", driveScopeActions);

    const localActions = buildPostDriveActions(snap);
    if (localActions.length > 0) {
      await client.execute(snap.id, "main", localActions);
    }

    const result = await migrateLegacyDriveState({
      reactor: client,
      readModel,
      driveId: snap.id,
      nodes: snap.nodes,
    });
    logger.info(
      `replayed drive ${snap.id}: ${result.emittedActions} action(s) (${snap.nodes.length} legacy node(s), ${result.skippedExisting} skipped)`,
    );
  }
}

function hostHasBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", [name], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

function runHostPgDump(connStr: string, outputPath: string): Promise<void> {
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

function runDockerPgDump(
  containerName: string,
  databaseName: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "pg_dump",
        "--username",
        "postgres",
        "--dbname",
        databaseName,
        "--schema=reactor",
        "--format=custom",
        "--no-owner",
        "--no-acl",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const out = createWriteStream(outputPath);
    out.on("error", reject);
    proc.stdout.pipe(out);

    proc.on("error", reject);
    proc.on("exit", (code) => {
      out.end();
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `docker exec pg_dump exited with code ${code}.\nstderr:\n${stderr}`,
          ),
        );
      }
    });
  });
}

async function runPgDump(
  connStr: string,
  outputPath: string,
  databaseName: string,
): Promise<void> {
  if (await hostHasBinary("pg_dump")) {
    await runHostPgDump(connStr, outputPath);
    return;
  }
  const containerName =
    process.env.REACTOR_TEST_PG_DOCKER_CONTAINER ?? "reactor-postgres";
  await runDockerPgDump(containerName, databaseName, outputPath);
}

async function readMetadata(
  connStr: string,
  sourceDescription: string,
): Promise<FixtureMetadata> {
  const pool = new Pool({ connectionString: connStr });
  try {
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
       ORDER BY id`,
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
       GROUP BY "documentId", scope, branch
       ORDER BY "documentId", scope, branch`,
    );

    const totalOps = opCounts.rows.reduce(
      (acc, row) => acc + Number(row.opCount),
      0,
    );

    return {
      capturedAt: new Date().toISOString(),
      sourceDescription,
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

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function withClient<T>(
  connStr: string,
  logger: ConsoleLogger,
  body: (client: IReactorClient) => Promise<T>,
): Promise<T> {
  const handle = createPostgresKysely(connStr);
  const reactorModule = await buildHubModule(logger, handle.kysely);
  try {
    const clientModule = await new ReactorClientBuilder()
      .withLogger(logger)
      .withReactor(
        reactorModule.reactor,
        reactorModule.eventBus,
        reactorModule.documentIndexer,
        reactorModule.documentView,
      )
      .buildModule();

    return await body(clientModule.client);
  } finally {
    reactorModule.reactor.kill();
    await handle.kysely.destroy();
    await handle.pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = new ConsoleLogger(["convert-hub-dump"]);

  if (!existsSync(args.source)) {
    throw new Error(`Source dump not found at: ${args.source}`);
  }
  mkdirSync(path.dirname(args.output), { recursive: true });
  mkdirSync(path.dirname(args.metadata), { recursive: true });

  const config = readPostgresTestConfigFromEnv();
  await requireDockerComposePostgres(config);

  const dbName = `reactor_convert_${process.pid}_${Date.now()}`;
  logger.info(`scratch database: ${dbName}`);

  const connStr = await createTestDatabase(dbName, config);
  try {
    logger.info(`restoring ${args.source} -> ${dbName}`);
    await restoreFromDump(connStr, args.source, dbName);

    // The source dump faithfully mirrors production, including soft-deleted
    // drives whose Operation rows are still present. Purge them up front so
    // the conversion only sees live documents.
    const preconvertPurged = await purgeDeletedDocuments(connStr);
    if (preconvertPurged.length > 0) {
      logger.info(
        `purged ${preconvertPurged.length} pre-existing tombstoned document(s) from source dump`,
      );
    }

    const driveIds = await readLegacyDriveIds(connStr);
    if (driveIds.length === 0) {
      throw new Error(
        `No "${DOCUMENT_DRIVE_TYPE}" documents found in ${args.source}.`,
      );
    }
    logger.info(`found ${driveIds.length} legacy drive(s) to convert`);

    const snapshots = await withClient(connStr, logger, async (client) => {
      const snaps = await snapshotLegacyDrives(client, driveIds, logger);
      await deleteLegacyDrives(client, driveIds, logger);
      return snaps;
    });

    const purged = await purgeDeletedDocuments(connStr);
    logger.info(`purged ${purged.length} tombstoned drive row(s)`);

    await withClient(connStr, logger, async (client) => {
      await rebuildAsReactorDrives(client, snapshots, logger);
    });

    logger.info(`running pg_dump -> ${args.output}`);
    await runPgDump(connStr, args.output, dbName);

    const metadata = await readMetadata(
      connStr,
      `converted from ${path.relative(process.cwd(), args.source)}`,
    );
    writeFileSync(args.metadata, JSON.stringify(metadata, null, 2) + "\n");

    const dumpSize = statSync(args.output).size;
    logger.info(
      `wrote ${metadata.totalOpCount} ops across ${metadata.documents.length} docs to ${path.relative(process.cwd(), args.output)} (${formatBytes(dumpSize)})`,
    );
    logger.info(
      `metadata sidecar: ${path.relative(process.cwd(), args.metadata)}`,
    );

    if (dumpSize > 25 * 1024 * 1024) {
      logger.warn(
        "dump size exceeds 25 MB — consider Git LFS before committing.",
      );
    }
  } finally {
    await dropTestDatabase(dbName, config);
    logger.info(`dropped scratch database ${dbName}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
