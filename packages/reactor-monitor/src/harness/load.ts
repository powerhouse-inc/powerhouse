import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { provisionInProcess } from "../in-process.js";
import { linkLocalSync, type LocalSyncHandle } from "../sync/link.js";
import type { ManagedInProcessReactor, ReactorDescriptor } from "../types.js";
import type {
  LoadHarnessOperationCounts,
  LoadHarnessOptions,
  LoadHarnessReactors,
  LoadHarnessReport,
} from "./types.js";

export type {
  LoadHarnessDurations,
  LoadHarnessMemorySamples,
  LoadHarnessOperationCounts,
  LoadHarnessOptions,
  LoadHarnessReactors,
  LoadHarnessReport,
  LoadHarnessThroughput,
} from "./types.js";

/**
 * Multi-reactor Stage-1 load harness (W1.3,
 * docs/plans/2026-10-03-multi-reactor.md): `runLocalSyncLoad` generates
 * `documentCount * opsPerDocument` operations on reactor A over the brokered
 * `LocalChannel` two-in-process-reactor link proven by
 * `test/local-sync.test.ts`, waits for reactor B to hold all of them, and
 * returns a stable, JSON-serializable report -- the Stage-P baseline record.
 *
 * Sync streams ops from A to B concurrently with generation -- B does not
 * wait for A to finish before applying what has already arrived. That means
 * a clock started only after generation resolves measures nothing but a
 * residual tail plus a poll quantum, not real propagation latency: most of
 * it already elapsed, unmeasured, while A was still generating. This harness
 * instead polls B from before generation starts, so `durationsMs.endToEndMs`
 * -- generation start to B holding every op -- is the honest headline
 * number; `durationsMs.residualTailMs` keeps the old post-generation-only
 * measurement around under a name that says what it is.
 *
 * Live-measured reference points (2026-10-04, two browser SharedWorker
 * reactors, Stage-P baselines -- see the plan's "W1.3 milestone achieved"
 * note): alpha->beta first-op propagation 105ms; beta->alpha first-op
 * propagation 87ms; a 50-op burst created on A in 4.9s (~10 ops/s durable
 * local write -- the flush cost, a Stage-P item) arrived on B 625ms after
 * creation finished. A small CI-sized run of this harness (20 docs x 5 ops
 * = 100 ops, in-process/memory storage, no browser/worker overhead) is
 * expected to clear these numbers by a wide margin; it is not a substitute
 * for the browser-measured baseline, only a regression guard that runs in
 * every suite.
 *
 * Load is generated as `drives.addFolder` calls on one shared drive, the
 * same primitive `local-sync.test.ts` already proved travels the link: each
 * call is one operation on the drive document, named
 * `load:<runId>:<doc>:<op>:<payload>` so propagation can be measured by
 * counting matching nodes on B without a bespoke document model. The run id
 * is salted per call so a second run against an already-linked pair passed
 * via `options.reactors` (the documented reuse case) never counts a prior
 * run's nodes as its own; the pre-run count of nodes already matching the
 * (fresh, so normally zero) prefix is also snapshotted and added to the
 * target, belt-and-suspenders against the same contamination. This
 * deliberately does not exercise separate per-document storage; see
 * docs/plans/2026-10-03-multi-reactor.md Stage P for the memory/DB-size axes
 * this harness seeds but does not itself fix.
 */
export async function runLocalSyncLoad(
  options: LoadHarnessOptions,
): Promise<LoadHarnessReport> {
  const run: LoadRunParams = {
    payloadSize: options.payloadSize ?? 0,
    propagationTimeoutMs: options.propagationTimeoutMs ?? 30_000,
    pollIntervalMs: options.pollIntervalMs ?? 25,
    totalOps: options.documentCount * options.opsPerDocument,
    nodePrefix: `load:${crypto.randomUUID().slice(0, 8)}:`,
  };

  const setupStart = now();
  const owned = options.reactors === undefined;
  const { a, b, driveId, link } =
    options.reactors ?? (await provisionLinkedPair(options));
  const setupMs = owned ? now() - setupStart : 0;

  let outcome: { report: LoadHarnessReport } | { error: unknown };
  try {
    const report = await generateAndMeasure(
      a,
      b,
      driveId,
      options,
      run,
      setupMs,
    );
    outcome = { report };
  } catch (error) {
    outcome = { error };
  }

  if (owned) {
    const teardownFailures = await teardownLinkedPair(link, a, b);
    // The original failure always wins: teardown problems are logged inside
    // teardownLinkedPair and only thrown here when there was no original
    // error for them to replace.
    if (!("error" in outcome) && teardownFailures.length > 0) {
      throw teardownFailures[0];
    }
  }

  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.report;
}

/** Derived, per-run values computed once in {@link runLocalSyncLoad} and threaded through the measurement phase. */
type LoadRunParams = {
  payloadSize: number;
  totalOps: number;
  /** Salted per run (see the module doc); every generated node's name starts with this. */
  nodePrefix: string;
  propagationTimeoutMs: number;
  pollIntervalMs: number;
};

async function generateAndMeasure(
  a: ManagedInProcessReactor,
  b: ManagedInProcessReactor,
  driveId: string,
  options: LoadHarnessOptions,
  run: LoadRunParams,
  setupMs: number,
): Promise<LoadHarnessReport> {
  const baseline = sampleMemory();
  const baselineCount = await countLoadNodesOrZero(b, driveId, run.nodePrefix);

  const generateStart = now();
  const propagation = trackPropagation(
    b,
    driveId,
    run.nodePrefix,
    baselineCount,
    run.totalOps,
    run.propagationTimeoutMs,
    run.pollIntervalMs,
  );
  await generateLoad(a, driveId, options, run.payloadSize, run.nodePrefix);
  const generateMs = now() - generateStart;
  const afterGenerate = sampleMemory();

  const endToEndMs = await propagation.completed;
  const firstOpArrivedAtBMs = await propagation.firstOpArrivedMs;
  const afterPropagate = sampleMemory();

  const operationCounts = await countOperations(a, b, driveId);
  const residualTailMs = Math.max(0, endToEndMs - generateMs);

  return {
    documentCount: options.documentCount,
    opsPerDocument: options.opsPerDocument,
    payloadSize: run.payloadSize,
    totalOps: run.totalOps,
    durationsMs: {
      setupMs,
      generateMs,
      firstOpArrivedAtBMs,
      endToEndMs,
      residualTailMs,
      totalMs: setupMs + endToEndMs,
    },
    throughput: {
      createOpsPerSec: rate(run.totalOps, generateMs),
      e2eOpsPerSec: rate(run.totalOps, endToEndMs),
    },
    operationCounts,
    memory: { baseline, afterGenerate, afterPropagate },
    driveId,
    reactorNames: { a: a.name, b: b.name },
  };
}

/**
 * Every step runs even when an earlier one rejects; failures are logged and
 * returned (never thrown here -- the caller decides whether a teardown
 * failure gets to outrank a real error from the run itself). `unlink` runs
 * to completion before either `kill`, not alongside them: `unlink` still
 * needs both reactors' storage alive to remove the sync peer, so racing it
 * against `kill` tears the PGlite connection out from under it instead of
 * just independently failing. The two kills have no such dependency on each
 * other and run concurrently.
 */
async function teardownLinkedPair(
  link: LocalSyncHandle,
  a: ManagedInProcessReactor,
  b: ManagedInProcessReactor,
): Promise<unknown[]> {
  const failures: unknown[] = [];

  try {
    await link.unlink();
  } catch (error) {
    failures.push(error);
    logTeardownFailure(error);
  }

  const killResults = await Promise.allSettled([a.kill(), b.kill()]);
  for (const result of killResults) {
    if (result.status === "rejected") {
      failures.push(result.reason);
      logTeardownFailure(result.reason);
    }
  }
  return failures;
}

function logTeardownFailure(reason: unknown): void {
  // eslint-disable-next-line no-console
  console.error("runLocalSyncLoad: teardown step failed", reason);
}

function now(): number {
  return performance.now();
}

/** Ops per second; 0 when nothing ran rather than an `Infinity`/`NaN`. */
function rate(ops: number, elapsedMs: number): number {
  return elapsedMs > 0 ? (ops / elapsedMs) * 1000 : 0;
}

/**
 * `process.memoryUsage()`, guarded for the browser-targeted barrel this
 * module is part of: `process` does not exist there at all, so a direct
 * call throws. `undefined` in that case; see
 * {@link LoadHarnessMemorySamples}.
 */
function sampleMemory(): NodeJS.MemoryUsage | undefined {
  if (
    typeof process !== "undefined" &&
    typeof process.memoryUsage === "function"
  ) {
    return process.memoryUsage();
  }
  return undefined;
}

async function provisionLinkedPair(
  options: LoadHarnessOptions,
): Promise<LoadHarnessReactors> {
  const suffix = crypto.randomUUID();
  const descriptor = (name: string): ReactorDescriptor => ({
    kind: "in-process",
    name: `${name}-${suffix}`,
    storage: { kind: "memory" },
    sync: { local: true },
  });

  const a = await provisionInProcess(descriptor("load-a"));
  const b = await provisionInProcess(descriptor("load-b"));
  try {
    const drive = await a.client.drives.create({
      global: { name: `load-${suffix}` },
    });
    const driveId = drive.header.id;
    const link = await linkLocalSync(a, b, {
      driveId,
      createChannel: options.createChannel,
    });
    return { a, b, driveId, link };
  } catch (error) {
    await a.kill();
    await b.kill();
    throw error;
  }
}

function loadNodeName(
  nodePrefix: string,
  doc: number,
  op: number,
  payloadSize: number,
): string {
  const payload = payloadSize > 0 ? `:${"p".repeat(payloadSize)}` : "";
  return `${nodePrefix}${doc}:${op}${payload}`;
}

/** Sequential, matching the measurement method the milestone baseline used. */
async function generateLoad(
  a: ManagedInProcessReactor,
  driveId: string,
  options: LoadHarnessOptions,
  payloadSize: number,
  nodePrefix: string,
): Promise<void> {
  for (let doc = 0; doc < options.documentCount; doc++) {
    for (let op = 0; op < options.opsPerDocument; op++) {
      await a.client.drives.addFolder(
        driveId,
        loadNodeName(nodePrefix, doc, op, payloadSize),
      );
    }
  }
}

/** True for `DocumentNotFoundError`/`DocumentPurgedError` by name, matching their `isError` without importing a class the package does not export publicly. */
function isDocumentNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "DocumentNotFoundError" ||
      error.name === "DocumentPurgedError")
  );
}

async function countLoadNodes(
  reactor: ManagedInProcessReactor,
  driveId: string,
  nodePrefix: string,
): Promise<number> {
  const drive = await reactor.client.get<DocumentDriveDocument>(driveId);
  return drive.state.global.nodes.filter((node) =>
    node.name.startsWith(nodePrefix),
  ).length;
}

/** `countLoadNodes`, treating "B has not even seen the drive yet" as 0 rather than a thrown error. Any other error still propagates. */
async function countLoadNodesOrZero(
  reactor: ManagedInProcessReactor,
  driveId: string,
  nodePrefix: string,
): Promise<number> {
  try {
    return await countLoadNodes(reactor, driveId, nodePrefix);
  } catch (error) {
    if (isDocumentNotFoundError(error)) {
      return 0;
    }
    throw error;
  }
}

/** Consecutive identical non-"not found" errors tolerated before `trackPropagation` gives up and surfaces the real exception. */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

type PropagationTracker = {
  /**
   * Resolves once B first holds more matching nodes than `baselineCount`,
   * with the ms-from-`start` timestamp of that observation; resolves
   * `undefined` instead if `completed` settles (returns or throws) before
   * that ever happens (e.g. `totalOps` was 0). Never rejects, so it is safe
   * to leave unawaited.
   */
  firstOpArrivedMs: Promise<number | undefined>;
  /** Resolves with `endToEndMs` once B holds `baselineCount + totalOps` matching nodes; rejects on timeout or a surfaced hard error. */
  completed: Promise<number>;
};

/**
 * Polls B from `start` (before generation on A begins, per the module doc)
 * until it holds `baselineCount + totalOps` nodes matching `nodePrefix`, or
 * until `timeoutMs` elapses. A bare "not found" (B has not even seen the
 * drive yet) counts as 0 and keeps polling; any other error is tolerated for
 * {@link MAX_CONSECUTIVE_POLL_ERRORS} consecutive occurrences before being
 * rethrown, so a hard B failure fails fast instead of spinning the full
 * timeout.
 */
function trackPropagation(
  b: ManagedInProcessReactor,
  driveId: string,
  nodePrefix: string,
  baselineCount: number,
  totalOps: number,
  timeoutMs: number,
  pollIntervalMs: number,
): PropagationTracker {
  const start = now();
  const targetCount = baselineCount + totalOps;
  const firstOpThreshold = baselineCount + 1;

  let resolveFirstOp: (value: number | undefined) => void;
  let firstOpSettled = false;
  const firstOpArrivedMs = new Promise<number | undefined>((resolve) => {
    resolveFirstOp = resolve;
  });
  const settleFirstOp = (value: number | undefined): void => {
    if (!firstOpSettled) {
      firstOpSettled = true;
      resolveFirstOp(value);
    }
  };

  const completed = (async (): Promise<number> => {
    try {
      const deadline = start + timeoutMs;
      // Tracked as one object, carried across loop iterations, rather than
      // two loose `let`s: each field is written and read on a later
      // iteration, not "later in this iteration", which a simple
      // per-variable liveness check cannot see across a `for (;;)` back-edge.
      const pollErrors = {
        count: 0,
        lastMessage: undefined as string | undefined,
      };
      for (;;) {
        let count: number;
        try {
          count = await countLoadNodesOrZero(b, driveId, nodePrefix);
          pollErrors.count = 0;
          pollErrors.lastMessage = undefined;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          pollErrors.count =
            message === pollErrors.lastMessage ? pollErrors.count + 1 : 1;
          if (pollErrors.count >= MAX_CONSECUTIVE_POLL_ERRORS) {
            throw error;
          }
          pollErrors.lastMessage = message;
          count = 0;
        }
        if (count >= firstOpThreshold) {
          settleFirstOp(now() - start);
        }
        if (count >= targetCount) {
          return now() - start;
        }
        if (now() >= deadline) {
          throw new Error(
            `runLocalSyncLoad: reactor "${b.name}" held ${count}/${targetCount} ops after ${timeoutMs}ms`,
          );
        }
        await sleep(pollIntervalMs);
      }
    } finally {
      settleFirstOp(undefined);
    }
  })();
  return { firstOpArrivedMs, completed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `Operation` rows for `driveId` on each side -- the approximate DB
 * footprint, read through each reactor's own `dbQuery` rather than a
 * bespoke counting method.
 */
async function countOperations(
  a: ManagedInProcessReactor,
  b: ManagedInProcessReactor,
  driveId: string,
): Promise<LoadHarnessOperationCounts> {
  const sql = `SELECT COUNT(*)::int AS count FROM "${REACTOR_SCHEMA}"."Operation" WHERE "documentId" = $1`;
  const [aCount, bCount] = await Promise.all([
    a.dbQuery.queryDb(sql, [driveId]),
    b.dbQuery.queryDb(sql, [driveId]),
  ]);
  return { a: operationCount(aCount), b: operationCount(bCount) };
}

function operationCount(rows: unknown[]): number {
  const row = rows[0] as { count?: unknown } | undefined;
  return typeof row?.count === "number" ? row.count : Number(row?.count ?? 0);
}
