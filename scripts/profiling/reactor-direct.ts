#!/usr/bin/env tsx
/**
 * Script to profile reactor performance directly (bypassing GraphQL API)
 * Usage: tsx reactor-direct.ts [N] [--operations M] [--op-loops L] [--db <connection-string>] [--doc-id <id>]
 *
 * This script is similar to docs-create.ts but interacts directly with a
 * reactor instance to isolate reactor performance from API latency.
 *
 * Database options:
 *   - Default: in-memory PGlite (no persistence)
 *   - PostgreSQL: --db "postgresql://user:pass@localhost:5432/dbname"
 *   - PGlite file: --db "./data" (persists to filesystem)
 */

import { documentModelDocumentModelModule } from "document-model";
import {
  ReactorBuilder,
  JobStatus,
  runMigrations,
  REACTOR_SCHEMA,
  type IReactor,
} from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { PGliteDialect } from "kysely-pglite-dialect";
import { Pool } from "pg";
import { PostgresDialect } from "kysely";

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
}

interface Percentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

interface OperationTiming {
  opIndex: number;
  durationMs: number;
  actionType: string;
}

interface OperationsResult {
  minOp: OperationTiming | null;
  maxOp: OperationTiming | null;
  durations: number[];
}

function getMemoryStats(): MemoryStats {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
  };
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

function formatMemory(stats: MemoryStats): string {
  return `heap: ${formatBytes(stats.heapUsed)}/${formatBytes(stats.heapTotal)}, rss: ${formatBytes(stats.rss)}`;
}

function calculatePercentiles(durations: number[]): Percentiles | null {
  if (durations.length === 0) return null;

  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const pos = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    const weight = pos - lower;

    if (lower === upper) return sorted[lower];
    return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
  };

  return {
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
  };
}

function formatPercentiles(p: Percentiles): string {
  return `p50: ${p.p50}ms, p90: ${p.p90}ms, p95: ${p.p95}ms, p99: ${p.p99}ms`;
}

function createAction(docIndex: number, opIndex: number) {
  const actions = documentModelDocumentModelModule.actions;
  const actionCreators = [
    {
      name: "setModelName",
      create: () =>
        actions.setModelName({ name: `Model-${docIndex}-op${opIndex}` }),
    },
    {
      name: "setModelDescription",
      create: () =>
        actions.setModelDescription({
          description: `Description for document ${docIndex}, operation ${opIndex}`,
        }),
    },
    {
      name: "setAuthorName",
      create: () =>
        actions.setAuthorName({
          authorName: `Author-${docIndex}-op${opIndex}`,
        }),
    },
    {
      name: "setAuthorWebsite",
      create: () =>
        actions.setAuthorWebsite({
          authorWebsite: `https://example-${docIndex}-${opIndex}.com`,
        }),
    },
    {
      name: "setModelExtension",
      create: () => actions.setModelExtension({ extension: `.ext${opIndex}` }),
    },
    {
      name: "setModelId",
      create: () =>
        actions.setModelId({ id: `org/model-${docIndex}-v${opIndex}` }),
    },
  ];

  const creator = actionCreators[opIndex % actionCreators.length];
  return { action: creator.create(), actionType: creator.name };
}

async function waitForJob(
  reactor: IReactor,
  jobId: string,
  timeout: number = 30000,
): Promise<void> {
  const startTime = Date.now();
  let lastStatus = "";
  while (Date.now() - startTime < timeout) {
    const status = await reactor.getJobStatus(jobId);
    lastStatus = status.status;
    if (status.status === JobStatus.FAILED) {
      throw new Error(
        `Job failed: ${status.error?.message ?? "unknown error"}`,
      );
    }
    if (status.status === JobStatus.READ_READY) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Job timed out after ${timeout}ms (last status: ${lastStatus})`,
  );
}

async function createDocument(
  reactor: IReactor,
  name: string,
): Promise<string> {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.name = name;

  const jobInfo = await reactor.create(document);
  await waitForJob(reactor, jobInfo.id);

  return document.header.id;
}

async function performOperations(
  reactor: IReactor,
  documentId: string,
  docIndex: number,
  operationCount: number,
  onProgress: (opNum: number, durationMs: number) => void,
): Promise<OperationsResult> {
  let minOp: OperationTiming | null = null;
  let maxOp: OperationTiming | null = null;
  const durations: number[] = [];

  for (let i = 0; i < operationCount; i++) {
    const { action, actionType } = createAction(docIndex, i + 1);
    const opStart = Date.now();

    const jobInfo = await reactor.execute(documentId, "main", [action]);
    if (!jobInfo?.id) {
      throw new Error(
        `Execute returned invalid job info for operation ${i + 1}`,
      );
    }
    await waitForJob(reactor, jobInfo.id);

    const durationMs = Date.now() - opStart;
    durations.push(durationMs);

    const timing: OperationTiming = { opIndex: i + 1, durationMs, actionType };

    if (minOp === null || durationMs < minOp.durationMs) {
      minOp = timing;
    }
    if (maxOp === null || durationMs > maxOp.durationMs) {
      maxOp = timing;
    }

    onProgress(i + 1, durationMs);
  }

  return { minOp, maxOp, durations };
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  opLoops: number;
  verbose: boolean;
  percentiles: boolean;
  showActionTypes: boolean;
  dbPath: string | undefined;
  docId: string | undefined;
} {
  let count = 10;
  let operations = 0;
  let opLoops = 1;
  let verbose = false;
  let percentiles = false;
  let showActionTypes = false;
  let dbPath: string | undefined = undefined;
  let docId: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--operations" || arg === "-o") && args[i + 1]) {
      operations = Number(args[++i]);
    } else if ((arg === "--op-loops" || arg === "-l") && args[i + 1]) {
      opLoops = Number(args[++i]);
    } else if (arg === "--db" && args[i + 1]) {
      dbPath = args[++i];
    } else if ((arg === "--doc-id" || arg === "-d") && args[i + 1]) {
      docId = args[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--percentiles" || arg === "-p") {
      percentiles = true;
    } else if (arg === "--show-action-types" || arg === "-a") {
      showActionTypes = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx reactor-direct.ts [N] [options]

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations per loop (default: 0)
  --op-loops, -l <L>        Number of operation loops per document (default: 1)
  --db <connection>         Database connection (default: in-memory PGlite)
                            PostgreSQL: "postgresql://user:pass@host:port/db"
                            PGlite file: "./data" (persists to filesystem)
  --doc-id, -d <id>         Target an existing document by ID (skips document creation)
  --verbose, -v             Show detailed operation timings
  --percentiles, -p         Show percentile statistics (p50, p90, p95, p99) per line
  --show-action-types, -a   Show action type names in min/max timings
  --help, -h                Show this help message

Process flow:
  1. Initialize reactor directly (no GraphQL API)
  2. Create N documents (or use --doc-id to skip and use existing document)
  3. For each document, perform M operations L times (total: M * L ops per document)

Examples:
  tsx reactor-direct.ts 10
  tsx reactor-direct.ts 10 --operations 5
  tsx reactor-direct.ts 1 -o 25 -l 100
  tsx reactor-direct.ts 5 -o 10 -l 3 -p
  tsx reactor-direct.ts 1 -o 25 -l 10 --db "postgresql://postgres:postgres@localhost:5432/reactor"
  tsx reactor-direct.ts -d abc123 -o 10 -l 5 --db "./data"
`);
      process.exit(0);
    } else if (!isNaN(Number(arg)) && arg.trim() !== "") {
      count = Number(arg);
    } else {
      console.error(`Error: Unrecognized argument: ${arg}`);
      console.error("Use --help for usage information.");
      process.exit(1);
    }
  }

  if (docId && count !== 10) {
    console.warn(
      `Warning: Document count argument is ignored when --doc-id is specified.`,
    );
  }

  if (!docId && count < 0) {
    console.error(`Error: Document count must be a non-negative integer.`);
    process.exit(1);
  }

  if (isNaN(operations) || operations < 0) {
    console.error(
      `Error: Invalid operations value: must be a non-negative integer.`,
    );
    process.exit(1);
  }

  if (isNaN(opLoops) || opLoops < 1) {
    console.error(
      `Error: Invalid op-loops value: must be a positive integer (>= 1).`,
    );
    process.exit(1);
  }

  if (operations === 0 && opLoops > 1) {
    console.warn(
      `Warning: --op-loops=${opLoops} has no effect when operations is 0.`,
    );
  }

  if (docId && operations === 0) {
    console.warn(
      `Warning: --doc-id specified but no operations to perform (use --operations).`,
    );
  }

  return {
    count,
    operations,
    opLoops,
    verbose,
    percentiles,
    showActionTypes,
    dbPath,
    docId,
  };
}

function isPostgres(connectionString: string): boolean {
  return (
    connectionString.startsWith("postgresql://") ||
    connectionString.startsWith("postgres://")
  );
}

async function createDatabase(
  dbPath: string | undefined,
): Promise<Kysely<any>> {
  if (!dbPath) {
    console.log("  Using in-memory PGlite database");
    return new Kysely({ dialect: new PGliteDialect(new PGlite()) });
  }

  if (isPostgres(dbPath)) {
    console.log(
      `  Connecting to PostgreSQL: ${dbPath.replace(/:[^:@]+@/, ":***@")}`,
    );
    const pool = new Pool({ connectionString: dbPath });
    return new Kysely({ dialect: new PostgresDialect({ pool }) });
  }

  console.log(`  Using PGlite with file storage: ${dbPath}`);
  return new Kysely({ dialect: new PGliteDialect(new PGlite(dbPath)) });
}

async function main() {
  const {
    count,
    operations,
    opLoops,
    verbose,
    percentiles: showPercentiles,
    showActionTypes,
    dbPath,
    docId,
  } = parseArgs(process.argv.slice(2));

  console.log("Initializing reactor directly (no GraphQL API)...");
  const initStart = Date.now();

  const db = await createDatabase(dbPath);

  console.log("  Running database migrations...");
  const migrationResult = await runMigrations(db, REACTOR_SCHEMA);
  if (!migrationResult.success && migrationResult.error) {
    throw new Error(`Migration failed: ${migrationResult.error.message}`);
  }

  const reactor = await new ReactorBuilder()
    .withDocumentModels([documentModelDocumentModelModule as any])
    .withKysely(db)
    .withMigrationStrategy("none")
    .build();

  const initDuration = ((Date.now() - initStart) / 1000).toFixed(2);
  console.log(`Reactor initialized in ${initDuration}s`);

  const initialMemory = getMemoryStats();
  console.log(`\nInitial memory: ${formatMemory(initialMemory)}`);

  const overallStartTime = Date.now();

  let documentIds: string[];

  if (docId) {
    // Verify and load existing document
    console.log(`\nLoading target document: ${docId}`);
    try {
      const doc = await reactor.get(docId);
      console.log(`  Found document: ${doc.header.name || "(unnamed)"}`);
      documentIds = [docId];
    } catch (error) {
      throw new Error(
        `Failed to load document ${docId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  } else {
    // Phase 1: Create documents
    console.log(`\nPhase 1: Creating ${count} documents...`);
    const createStartTime = Date.now();
    documentIds = [];

    for (let i = 0; i < count; i++) {
      const id = await createDocument(reactor, `doc-${i + 1}`);
      documentIds.push(id);
      process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
    }

    const createDurationMs = Date.now() - createStartTime;
    const createDuration = (createDurationMs / 1000).toFixed(2);
    const msPerDoc = (createDurationMs / count).toFixed(0);
    const phase1Memory = getMemoryStats();
    console.log(
      `\n  Created ${count} documents in ${createDuration}s (avg: ${msPerDoc}ms/doc)`,
    );
    console.log(`  Memory: ${formatMemory(phase1Memory)}`);
  }

  // Phase 2: Perform operations on each document
  if (operations > 0) {
    const docCount = documentIds.length;
    const loopLabel = opLoops > 1 ? ` x ${opLoops} loops` : "";
    const phaseLabel = docId
      ? `Performing ${operations} operations${loopLabel} on target document...`
      : `Performing ${operations} operations${loopLabel} on each document...`;
    console.log(`\nPhase 2: ${phaseLabel}`);
    const opsStartTime = Date.now();
    const totalOps = docCount * operations * opLoops;

    let overallMinOp: {
      docId: string;
      docNum: number;
      loop: number;
      timing: OperationTiming;
    } | null = null;
    let overallMaxOp: {
      docId: string;
      docNum: number;
      loop: number;
      timing: OperationTiming;
    } | null = null;
    const allDurations: number[] = [];

    for (let i = 0; i < documentIds.length; i++) {
      const docNum = i + 1;
      const docId = documentIds[i];

      for (let loop = 1; loop <= opLoops; loop++) {
        const loopStartTime = Date.now();
        const loopPrefix = opLoops > 1 ? `loop ${loop}/${opLoops}: ` : "";

        if (verbose) {
          console.log(`  [${docNum}/${docCount}] ${docId} ${loopPrefix}:`);
        }

        const result = await performOperations(
          reactor,
          docId,
          docNum,
          operations,
          (opNum, durationMs) => {
            if (verbose) {
              console.log(`    op ${opNum}/${operations}: ${durationMs}ms`);
            } else {
              process.stdout.write(
                `\r  [${docNum}/${docCount}] ${docId}: ${loopPrefix}${opNum}/${operations} ops`,
              );
            }
          },
        );

        if (
          result.minOp &&
          (overallMinOp === null ||
            result.minOp.durationMs < overallMinOp.timing.durationMs)
        ) {
          overallMinOp = { docId, docNum, loop, timing: result.minOp };
        }
        if (
          result.maxOp &&
          (overallMaxOp === null ||
            result.maxOp.durationMs > overallMaxOp.timing.durationMs)
        ) {
          overallMaxOp = { docId, docNum, loop, timing: result.maxOp };
        }
        if (showPercentiles) {
          allDurations.push(...result.durations);
        }

        const loopDurationMs = Date.now() - loopStartTime;
        const loopDuration = (loopDurationMs / 1000).toFixed(2);
        const msPerOp = (loopDurationMs / operations).toFixed(0);

        const minMax =
          result.minOp && result.maxOp
            ? showActionTypes
              ? `, min: ${result.minOp.durationMs}ms (${result.minOp.actionType}), max: ${result.maxOp.durationMs}ms (${result.maxOp.actionType})`
              : `, min: ${result.minOp.durationMs}ms, max: ${result.maxOp.durationMs}ms`
            : "";

        const loopPercentiles = showPercentiles
          ? calculatePercentiles(result.durations)
          : null;
        const percentilesStr = loopPercentiles
          ? `\n      ${formatPercentiles(loopPercentiles)}`
          : "";

        if (verbose) {
          console.log(
            `    Done: ${loopDuration}s, ${msPerOp}ms/op${minMax}${percentilesStr}`,
          );
        } else {
          process.stdout.write(
            ` (${loopDuration}s, ${msPerOp}ms/op${minMax})${percentilesStr}\n`,
          );
        }
      }
    }

    const opsDurationMs = Date.now() - opsStartTime;
    const opsDuration = (opsDurationMs / 1000).toFixed(2);
    const avgMsPerOp = (opsDurationMs / totalOps).toFixed(0);
    const phase2Memory = getMemoryStats();
    const overallMinMax =
      overallMinOp && overallMaxOp
        ? showActionTypes
          ? `, min: ${overallMinOp.timing.durationMs}ms (${overallMinOp.timing.actionType}), max: ${overallMaxOp.timing.durationMs}ms (${overallMaxOp.timing.actionType})`
          : `, min: ${overallMinOp.timing.durationMs}ms, max: ${overallMaxOp.timing.durationMs}ms`
        : "";
    console.log(
      `  Completed ${totalOps} operations in ${opsDuration}s (avg: ${avgMsPerOp}ms/op${overallMinMax})`,
    );
    if (showPercentiles) {
      const percentiles = calculatePercentiles(allDurations);
      if (percentiles) {
        console.log(`  Overall percentiles: ${formatPercentiles(percentiles)}`);
      }
    }
    console.log(`  Memory: ${formatMemory(phase2Memory)}`);
  }

  // Cleanup
  reactor.kill();
  await db.destroy();

  // Summary
  const finalMemory = getMemoryStats();
  const totalDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  const heapDelta = finalMemory.heapUsed - initialMemory.heapUsed;
  const rssDelta = finalMemory.rss - initialMemory.rss;
  console.log(`\nDone! Total time: ${totalDuration}s`);
  console.log(
    `Memory delta: heap: ${heapDelta >= 0 ? "+" : ""}${formatBytes(heapDelta)}, rss: ${rssDelta >= 0 ? "+" : ""}${formatBytes(rssDelta)}`,
  );
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
