// Fires one workflow repeatedly against the built engine and a real in-process
// reactor, reporting latency per batch as the run journal grows. See README.md.
import {
  createHybridProjectionCoordinatorFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  type DocumentModelSource,
  type IReactorClient,
  type ModelManifestEntry,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  Connection,
  REACTOR_CONNECTOR_ID,
  actions as connectionActions,
} from "@powerhousedao/workflow/document-models/connection";
import {
  Workflow,
  actions as workflowActions,
} from "@powerhousedao/workflow/document-models/workflow";
import { sql } from "kysely";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { Session } from "node:inspector/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { performance as perfHooks } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFreshRelationalDb } from "../test/helpers/pglite.ts";
import { freshDatabase, hostKysely, journalDb } from "./postgres.ts";
import { createBenchDurablePglite } from "./pglite-durable.ts";
import { profilesIn, pushProfiles } from "./pyroscope-push.ts";
import { benchTelemetry } from "./telemetry.ts";
import { testSigner } from "../test/helpers/signer.ts";

const { values: args } = parseArgs({
  options: {
    workload: { type: "string", default: "piece" },
    runs: { type: "string", default: "100" },
    warmup: { type: "string", default: "5" },
    steps: { type: "string", default: "1" },
    concurrency: { type: "string", default: "1" },
    // Worker slots; defaults to --concurrency.
    pool: { type: "string" },
    // Step kinds repeated across --steps, e.g. "piece,core"; default the workload.
    mix: { type: "string" },
    batch: { type: "string", default: "25" },
    "seed-runs": { type: "string", default: "0" },
    "seed-steps": { type: "string", default: "3" },
    history: { type: "string", default: "0" },
    profile: { type: "boolean", default: false },
    // Pyroscope base URL; implies --profile.
    pyroscope: { type: "string" },
    // OTLP/HTTP base URL to export spans to, e.g. http://localhost:4318.
    otlp: { type: "string" },
    // Runs without a tracer or meter, to measure what telemetry costs.
    "no-trace": { type: "boolean", default: false },
    // runs-page: list every workflow's runs, or only the benched workflow's.
    scope: { type: "string", default: "all" },
    "page-size": { type: "string", default: "25" },
    // Postgres server URL; each run gets a fresh database on it.
    postgres: { type: "string" },
    // Reactor executor worker threads (REACTOR_WORKERS); needs --postgres.
    "reactor-workers": { type: "string", default: "0" },
    // The reactor's projection worker thread; needs --postgres.
    "projection-worker": { type: "boolean", default: false },
    // Directory for on-disk PGlite, as Switchboard keeps it; fsyncs unless PH_PGLITE_FSYNC=0.
    "pglite-dir": { type: "string" },
    // The workflow's policy.concurrency; QUEUE runs its firings one at a time.
    policy: { type: "string", default: "PARALLEL" },
    out: { type: "string" },
  },
});

const WORKLOADS = [
  "core",
  "piece",
  "reactor-read",
  "reactor-write",
  "runs-page",
  "purge",
] as const;
type Workload = (typeof WORKLOADS)[number];
const workload = args.workload as Workload;
if (!WORKLOADS.includes(workload)) {
  throw new Error(`--workload must be one of ${WORKLOADS.join(", ")}`);
}
const RUNS = Number(args.runs);
const WARMUP = Number(args.warmup);
const STEPS = Number(args.steps);
const CONCURRENCY = Number(args.concurrency);
const POOL = Number(args.pool ?? args.concurrency);
const STEP_KINDS = ["core", "piece", "reactor-read", "reactor-write"] as const;
type StepKind = (typeof STEP_KINDS)[number];
const MIX = (args.mix?.split(",") ?? []) as StepKind[];
for (const kind of MIX) {
  if (!STEP_KINDS.includes(kind)) {
    throw new Error(`--mix kinds must be among ${STEP_KINDS.join(", ")}`);
  }
}
const BATCH = Number(args.batch);
const SEED_RUNS = Number(args["seed-runs"]);
const SEED_STEPS = Number(args["seed-steps"]);
const HISTORY = Number(args.history);
const REACTOR_WORKERS = Number(args["reactor-workers"]);
if ((REACTOR_WORKERS > 0 || args["projection-worker"]) && !args.postgres) {
  throw new Error("--reactor-workers and --projection-worker need --postgres");
}

const here = dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = args.out ?? join(here, ".out", `${stamp}-${workload}`);
mkdirSync(outDir, { recursive: true });

// Read when the runtime builds its pool, so set before the engine loads.
process.env.PH_WORKFLOWS_RUN_CONCURRENCY = String(POOL);

const engine = await import("../dist/index.js");
const { packagePieces, CORE_PIECE_NAME, CORE_PIECE_VERSION } = engine;

const REACTOR_PIECE = "@powerhousedao/piece-reactor";
const PUBLISHER = "0xpublisher";
const WORKFLOW_ID = "wf-bench";
const CONN = "conn-bench";
const NOOP_PIECE = "@bench/piece-noop";

// --- pieces ---------------------------------------------------------------

const require = createRequire(import.meta.url);
const workflowRoot = dirname(
  require.resolve("@powerhousedao/workflow/package.json"),
);

async function builtPieces() {
  const list = (await import(
    pathToFileURL(join(workflowRoot, "dist/node/pieces/index.mjs")).href
  )) as { pieces: { name: string; entry?: string; bundle?: string }[] };
  const { version } = JSON.parse(
    readFileSync(join(workflowRoot, "package.json"), "utf8"),
  ) as { version: string };
  return list.pieces.map((piece) => {
    const where = piece.entry ?? piece.bundle ?? "";
    const path = isAbsolute(where) ? where : join(workflowRoot, where);
    return {
      name: piece.name,
      version,
      ...(piece.entry ? { entryPath: path } : { bundleDir: path }),
    };
  });
}

function noopPiece() {
  const dir = mkdtempSync(join(tmpdir(), "rw-bench-"));
  const entryPath = join(dir, "index.mjs");
  writeFileSync(
    entryPath,
    `export const noop = {
  displayName: "Noop",
  actions: { noop: { name: "noop", displayName: "Noop", props: {}, run: async () => ({ ok: true }) } },
  triggers: {},
};`,
  );
  return { name: NOOP_PIECE, version: "1.0.0", entryPath };
}

const workflowPieces = await builtPieces();
const reactorPieceVersion = workflowPieces.find(
  (piece) => piece.name === REACTOR_PIECE,
)!.version;
packagePieces.setPieces([...workflowPieces, noopPiece()]);

function packageRoot(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  return dir;
}

function modelManifest(): ModelManifestEntry[] {
  return [
    {
      documentType: "powerhouse/connection",
      version: "1",
      spec: {
        module: {
          filePath: join(
            workflowRoot,
            "dist/node/document-models/connection/index.mjs",
          ),
          exportName: "Connection",
        },
      },
    },
    {
      documentType: "powerhouse/document-drive",
      version: "1",
      spec: {
        module: {
          filePath: join(
            packageRoot("@powerhousedao/shared"),
            "dist/document-drive/index.js",
          ),
          exportName: "driveDocumentModelModule",
        },
      },
    },
  ];
}

// --- reactor and documents ------------------------------------------------

const database = args.postgres
  ? await freshDatabase(
      args.postgres,
      `rw_bench_${stamp.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
    )
  : undefined;

const durable =
  !database && args["pglite-dir"]
    ? await createBenchDurablePglite(join(args["pglite-dir"], stamp))
    : undefined;

// Worker threads re-import models, so on Postgres every model is a file.
function modelSources(): DocumentModelSource[] {
  if (!database) {
    return [
      Workflow as unknown as DocumentModelModule,
      Connection as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ];
  }
  return [
    {
      filePath: join(
        workflowRoot,
        "dist/node/document-models/workflow/index.mjs",
      ),
      exportName: "Workflow",
    },
    ...modelManifest().map((entry) => entry.spec.module),
  ];
}

function reactorBuilder(): ReactorBuilder {
  const builder = new ReactorBuilder().withDocumentModelSources(modelSources());
  if (durable) builder.withKysely(durable.reactorKysely as never);
  if (!database) return builder;
  builder.withKysely(hostKysely(database.config("bench-host", 16)) as never);
  if (REACTOR_WORKERS > 0) {
    builder.withWorkerPool({
      numWorkers: REACTOR_WORKERS,
      db: database.config("bench-worker", 2),
    });
  }
  if (args["projection-worker"]) {
    builder.withReadModelCoordinatorFactory(
      createHybridProjectionCoordinatorFactory({
        shardCount: 1,
        poolSize: 8,
        db: database.config("bench-projection", 8),
        onFatal: (error) => {
          console.error("projection worker failed", error);
          process.exit(1);
        },
      }),
    );
  }
  return builder;
}

const module = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder())
  .buildModule();
const publisher: IReactorClient = await new ReactorClientBuilder()
  .withReactor(
    module.reactor,
    module.eventBus,
    module.documentIndexer,
    module.documentView,
  )
  .withSigner(await testSigner(PUBLISHER))
  .build();

async function create(model: DocumentModelModule, id: string) {
  await publisher.create(
    withSignaturePolicy(model.utils.createDocument(), "legacy", { id }),
  );
}

await create(Connection as never, CONN);
await publisher.execute(CONN, "main", [
  connectionActions.setConnectionName({ name: "bench" }),
  connectionActions.setConnector({
    connectorId: REACTOR_CONNECTOR_ID,
    authType: "REACTOR",
  }),
  connectionActions.setConfig({ config: { endpoint: "local" } }),
]);

function stepFor(i: number) {
  const base = { id: `s${i}`, key: `step${i}`, name: `step${i}` };
  const kind = MIX.length > 0 ? MIX[i % MIX.length]! : workload;
  switch (kind) {
    // Read workloads fire core runs only to warm up and migrate the journal.
    case "runs-page":
    case "purge":
    case "core":
      return {
        ...base,
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "assert",
        config: { value: "ok" },
      };
    case "piece":
      return {
        ...base,
        pieceName: NOOP_PIECE,
        pieceVersion: "1.0.0",
        actionName: "noop",
        config: {},
      };
    case "reactor-read":
      return {
        ...base,
        pieceName: REACTOR_PIECE,
        pieceVersion: reactorPieceVersion,
        actionName: "document-get",
        config: { documentId: CONN },
        reactorConnectionId: CONN,
      };
    case "reactor-write":
      return {
        ...base,
        pieceName: REACTOR_PIECE,
        pieceVersion: reactorPieceVersion,
        actionName: "document-dispatch",
        config: {
          documentId: CONN,
          actions: [{ type: "SET_CONNECTION_NAME", input: { name: `n${i}` } }],
        },
        reactorConnectionId: CONN,
      };
  }
}

await create(Workflow as never, WORKFLOW_ID);
const steps = Array.from({ length: STEPS }, (_, i) => stepFor(i));
await publisher.execute(WORKFLOW_ID, "main", [
  workflowActions.setWorkflowName({ name: "bench" }),
  workflowActions.setTrigger({
    id: "t1",
    pieceName: CORE_PIECE_NAME,
    pieceVersion: CORE_PIECE_VERSION,
    triggerName: "manual",
    config: {},
  }),
  ...steps.map((step) => workflowActions.addStep(step as never)),
  ...steps.map((step, i) =>
    workflowActions.addEdge({
      id: `e${i}`,
      from: i === 0 ? "t1" : `s${i - 1}`,
      to: step.id,
      port: "next",
    }),
  ),
  workflowActions.setPolicy({ concurrency: args.policy } as never),
  workflowActions.publishWorkflow({ publishedAt: new Date().toISOString() }),
  workflowActions.setWorkflowStatus({ status: "ENABLED" }),
]);

// Editor churn on the workflow document, which the run-user lookup pages over.
for (let done = 0; done < HISTORY; done += 100) {
  const count = Math.min(100, HISTORY - done);
  await publisher.execute(
    WORKFLOW_ID,
    "main",
    Array.from({ length: count }, (_, i) =>
      workflowActions.setWorkflowName({ name: `bench-${done + i}` }),
    ),
  );
}

// --- runtime ----------------------------------------------------------------

const telemetry = args["no-trace"]
  ? undefined
  : benchTelemetry({
      ...(args.otlp ? { otlp: args.otlp } : {}),
      attributes: { "bench.run": basename(outDir), "bench.workload": workload },
    });

const relationalDb = database
  ? journalDb(database.url)
  : (durable?.relationalDb ?? createFreshRelationalDb());
const service = engine.createWorkflowRuntime({
  ...(telemetry
    ? { telemetry: { tracer: telemetry.tracer, meter: telemetry.meter } }
    : {}),
  relationalDb,
  reactorClient: publisher,
  assertCanRead: () => Promise.resolve(undefined),
  assertCanWrite: () => Promise.resolve(undefined),
  subjectOf: (ctx: unknown) => ({
    address: (ctx as { user?: { address?: string } }).user?.address,
  }),
  authEnforcement: false,
  modelManifest,
  pieceVersionLookupMs: 15_000,
});

const fire = () =>
  service.fire(WORKFLOW_ID, { bench: true }, "schedule", undefined, undefined);

// --- journal seeding --------------------------------------------------------

async function journalSchema(): Promise<string> {
  const { rows } = await sql<{ table_schema: string }>`
    select table_schema from information_schema.tables
    where table_name = 'step_execution'`.execute(relationalDb);
  if (!rows[0]) throw new Error("Run journal not migrated yet");
  return rows[0].table_schema;
}

async function seedJournal(schema: string, runs: number, perRun: number) {
  const s = sql.id(schema);
  const output = JSON.stringify({ seeded: true, pad: "x".repeat(512) });
  for (let from = 1; from <= runs; from += 20_000) {
    const to = Math.min(runs, from + 19_999);
    await sql`
      insert into ${s}.run (id, workflow_id, workflow_name, workflow_version,
        trigger_kind, trigger_payload, status, enqueued_at, started_at, ended_at)
      select 'seed-' || g,
        case when g % 50 = 0 then ${WORKFLOW_ID} else 'wf-seed-' || (g % 50) end,
        'seed', 1, 'schedule',
        '{"n":' || g || '}', 'SUCCEEDED', ts, ts, ts
      from generate_series(${from}::int, ${to}::int) g,
        lateral (select to_char(timestamp '2026-01-01' + g * interval '1 second',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ts) t`.execute(relationalDb);
    await sql`
      insert into ${s}.step_execution (id, run_id, ordinal, step_id, step_key,
        piece_name, block_name, status, input, output, port)
      select 'seed-' || g || '-' || k, 'seed-' || g, k, 's' || k, 'step' || k,
        ${NOOP_PIECE}, 'noop', 'SUCCEEDED', '{}', ${output}, 'next'
      from generate_series(${from}::int, ${to}::int) g,
        generate_series(0, ${perRun - 1}::int) k`.execute(relationalDb);
  }
}

async function journalCounts(schema: string) {
  const s = sql.id(schema);
  const { rows } = await sql<{ runs: number; steps: number; docs: number }>`
    select (select count(*)::int from ${s}.run) runs,
      (select count(*)::int from ${s}.step_execution) steps,
      (select count(*)::int from ${s}.run_document) docs`.execute(relationalDb);
  return rows[0]!;
}

// --- measurement ------------------------------------------------------------

type Sample = { ms: number; stepMs: number };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function summarize(samples: Sample[]) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const runMean = mean(ms);
  const stepMean = mean(samples.map((s) => s.stepMs));
  return {
    n: samples.length,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    max: ms.at(-1) ?? 0,
    mean: runMean,
    stepMean,
    // Everything outside the steps' own startedAt..endedAt.
    overheadMean: runMean - stepMean,
  };
}

// A caller the host lets read everything.
const CALLER = { headers: {}, db: {}, user: { address: PUBLISHER } } as never;
let purged = 0;

async function oneRead(): Promise<Sample> {
  const started = performance.now();
  if (workload === "runs-page") {
    const page = await service.runsPage(
      {
        ...(args.scope === "workflow" ? { workflowId: WORKFLOW_ID } : {}),
        limit: Number(args["page-size"]),
      },
      CALLER,
    );
    // An empty page would time nothing worth timing.
    if (page.records.length === 0) throw new Error("runsPage served no runs");
  } else {
    // A document no run touched: the erase scans and removes nothing.
    await service.onDocumentsPurged([
      {
        operation: { action: { type: "DELETE_DOCUMENT", input: {} } },
        context: {
          documentId: `purged-${++purged}`,
          documentType: "powerhouse/connection",
        },
      } as never,
    ]);
  }
  return { ms: performance.now() - started, stepMs: 0 };
}

async function oneRun(warmup = false): Promise<Sample> {
  if (!warmup && (workload === "runs-page" || workload === "purge")) {
    return oneRead();
  }
  const started = performance.now();
  const result = await fire();
  const ms = performance.now() - started;
  if (result.status !== "SUCCEEDED") {
    const failed = result.steps.find((step) => step.status !== "SUCCEEDED");
    throw new Error(
      `Run ${result.runId} ${result.status}: ${JSON.stringify(failed?.error ?? failed)}`,
    );
  }
  let stepMs = 0;
  for (const step of result.steps) {
    if (step.startedAt && step.endedAt) {
      stepMs += Date.parse(step.endedAt) - Date.parse(step.startedAt);
    }
  }
  return { ms, stepMs };
}

for (let i = 0; i < WARMUP; i++) await oneRun(true);

const schema = await journalSchema();
if (SEED_RUNS > 0) {
  const seeded = performance.now();
  await seedJournal(schema, SEED_RUNS, SEED_STEPS);
  const seconds = (performance.now() - seeded) / 1000;
  console.log(
    `seeded ${SEED_RUNS} runs x ${SEED_STEPS} steps in ${seconds.toFixed(1)}s`,
  );
}

let profiler: Session | undefined;
if (args.profile || args.pyroscope) {
  // Only children forked from here on profile; the warm-up's are gone.
  const workerDir = join(outDir, "workers");
  mkdirSync(workerDir, { recursive: true });
  process.env.PH_WORKFLOWS_WORKER_CPU_PROF_DIR = workerDir;
  profiler = new Session();
  profiler.connect();
  await profiler.post("Profiler.enable");
  await profiler.post("Profiler.setSamplingInterval", { interval: 200 });
  await profiler.post("Profiler.start");
}

console.log(
  `workload=${workload} steps=${STEPS} mix=${MIX.join(",") || workload} runs=${RUNS} concurrency=${CONCURRENCY} pool=${POOL} seed=${SEED_RUNS} history=${HISTORY} ` +
    `db=${database ? "postgres" : "pglite"} reactorWorkers=${REACTOR_WORKERS} projectionWorker=${args["projection-worker"]}`,
);
const cols = [
  "runs",
  "journal",
  "p50",
  "p95",
  "max",
  "mean",
  "stepAvg",
  "overhead",
  "runs/s",
];
console.log(cols.map((c) => c.padStart(9)).join(""));
const cell = (n: number, digits = 1) => n.toFixed(digits).padStart(9);

const all: Sample[] = [];
const batches: object[] = [];
telemetry?.record(true);
const benchStarted = performance.now();
const loopStarted = perfHooks.eventLoopUtilization();
const cpuStarted = process.cpuUsage();
let issued = 0;
while (issued < RUNS) {
  const size = Math.min(BATCH, RUNS - issued);
  const batch: Sample[] = [];
  const batchStarted = performance.now();
  let claimed = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, size) }, async () => {
      while (claimed < size) {
        claimed++;
        batch.push(await oneRun());
      }
    }),
  );
  issued += size;
  const runsPerSec = size / ((performance.now() - batchStarted) / 1000);
  const stats = summarize(batch);
  const journal = SEED_RUNS + WARMUP + issued;
  batches.push({ journal, ...stats, runsPerSec });
  all.push(...batch);
  console.log(
    [issued, journal].map((n) => cell(n, 0)).join("") +
      [
        stats.p50,
        stats.p95,
        stats.max,
        stats.mean,
        stats.stepMean,
        stats.overheadMean,
        runsPerSec,
      ]
        .map((n) => cell(n))
        .join(""),
  );
}
const totalSeconds = (performance.now() - benchStarted) / 1000;
// The host's main thread, and CPU across all of the host's threads.
const hostLoop = perfHooks.eventLoopUtilization(loopStarted).utilization;
const cpu = process.cpuUsage(cpuStarted);
const hostCores = (cpu.user + cpu.system) / 1e6 / totalSeconds;
telemetry?.record(false);

if (profiler) {
  const { profile } = await profiler.post("Profiler.stop");
  writeFileSync(join(outDir, "host.cpuprofile"), JSON.stringify(profile));
  profiler.disconnect();
}

const total = summarize(all);
const memory = process.memoryUsage();
const counts = await journalCounts(schema);
const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(0)}MB`;
console.log(
  `total    p50=${total.p50.toFixed(1)}ms p95=${total.p95.toFixed(1)}ms mean=${total.mean.toFixed(1)}ms ` +
    `overhead=${total.overheadMean.toFixed(1)}ms runs/s=${(RUNS / totalSeconds).toFixed(1)} ` +
    `rss=${mb(memory.rss)} heap=${mb(memory.heapUsed)}`,
);
console.log(
  `host     loop=${hostLoop.toFixed(2)} cpu=${hostCores.toFixed(2)} cores`,
);
console.log(
  `journal  runs=${counts.runs} steps=${counts.steps} run_documents=${counts.docs}`,
);

// Nested spans overlap their parents, so perRun columns don't sum to a run.
const spans = telemetry?.breakdown(RUNS) ?? [];
if (spans.length > 0) {
  console.log(
    `\n${"span".padEnd(34)}${["count", "perRun", "mean", "p50", "p95"].map((c) => c.padStart(9)).join("")}`,
  );
  for (const row of spans) {
    console.log(
      row.name.padEnd(34) +
        cell(row.count, 0) +
        [row.perRun, row.mean, row.p50, row.p95].map((n) => cell(n)).join(""),
    );
  }
}

writeFileSync(
  join(outDir, "result.json"),
  JSON.stringify(
    {
      args,
      node: process.version,
      total,
      runsPerSec: RUNS / totalSeconds,
      host: { loop: hostLoop, cores: hostCores },
      memory,
      journal: counts,
      batches,
      spans,
    },
    null,
    2,
  ),
);
console.log(`out      ${outDir}`);

service.shutdown();
module.reactor.kill();
// Flushes what is still queued for OTLP.
await telemetry?.shutdown();

if (args.pyroscope) {
  // A killed worker writes its profile on the way out.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const labels = {
    workload,
    steps: String(STEPS),
    concurrency: String(CONCURRENCY),
    bench_run: basename(outDir),
  };
  const until = Date.now() / 1000;
  const window = { from: until - totalSeconds, until };
  await pushProfiles(
    [join(outDir, "host.cpuprofile")],
    args.pyroscope,
    "reactor-workflow-bench",
    { ...labels, process: "host" },
    window,
  );
  await pushProfiles(
    profilesIn(join(outDir, "workers")),
    args.pyroscope,
    "reactor-workflow-bench",
    { ...labels, process: "worker" },
    window,
  );
  console.log(`pyroscope ${args.pyroscope} bench_run=${labels.bench_run}`);
}
// PGlite and the reactor keep handles open; the numbers are written.
process.exit(0);
