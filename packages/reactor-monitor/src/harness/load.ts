import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { provisionInProcess } from "../in-process.js";
import { linkLocalSync } from "../sync/link.js";
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
 * `load:<doc>:<op>:<payload>` so propagation can be measured by counting
 * matching nodes on B without a bespoke document model. This deliberately
 * does not exercise separate per-document storage; see
 * docs/plans/2026-10-03-multi-reactor.md Stage P for the memory/DB-size axes
 * this harness seeds but does not itself fix.
 */
export async function runLocalSyncLoad(
  options: LoadHarnessOptions,
): Promise<LoadHarnessReport> {
  const payloadSize = options.payloadSize ?? 0;
  const propagationTimeoutMs = options.propagationTimeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  const totalOps = options.documentCount * options.opsPerDocument;

  const setupStart = now();
  const owned = options.reactors === undefined;
  const { a, b, driveId, link } =
    options.reactors ?? (await provisionLinkedPair(options));
  const setupMs = owned ? now() - setupStart : 0;

  try {
    const baseline = process.memoryUsage();

    const generateStart = now();
    // Started before generation, not after: sync streams ops to B
    // concurrently with generation, so the poller has to be live from the
    // same clock origin as generation for `endToEndMs` to mean what it says.
    const propagation = trackPropagation(
      b,
      driveId,
      totalOps,
      propagationTimeoutMs,
      pollIntervalMs,
    );
    await generateLoad(a, driveId, options, payloadSize);
    const generateMs = now() - generateStart;
    const afterGenerate = process.memoryUsage();

    const endToEndMs = await propagation.completed;
    const firstOpArrivedAtBMs = await propagation.firstOpArrivedMs;
    const afterPropagate = process.memoryUsage();

    const operationCounts = await countOperations(a, b, driveId);
    const residualTailMs = Math.max(0, endToEndMs - generateMs);

    return {
      documentCount: options.documentCount,
      opsPerDocument: options.opsPerDocument,
      payloadSize,
      totalOps,
      durationsMs: {
        setupMs,
        generateMs,
        firstOpArrivedAtBMs,
        endToEndMs,
        residualTailMs,
        totalMs: setupMs + endToEndMs,
      },
      throughput: {
        createOpsPerSec: rate(totalOps, generateMs),
        e2eOpsPerSec: rate(totalOps, endToEndMs),
      },
      operationCounts,
      memory: { baseline, afterGenerate, afterPropagate },
      driveId,
      reactorNames: { a: a.name, b: b.name },
    };
  } finally {
    if (owned) {
      await link.unlink();
      await a.kill();
      await b.kill();
    }
  }
}

function now(): number {
  return performance.now();
}

/** Ops per second; 0 when nothing ran rather than an `Infinity`/`NaN`. */
function rate(ops: number, elapsedMs: number): number {
  return elapsedMs > 0 ? (ops / elapsedMs) * 1000 : 0;
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

/** The name prefix every generated op's node carries; propagation counts these. */
const LOAD_NODE_PREFIX = "load:";

function loadNodeName(doc: number, op: number, payloadSize: number): string {
  const payload = payloadSize > 0 ? `:${"p".repeat(payloadSize)}` : "";
  return `${LOAD_NODE_PREFIX}${doc}:${op}${payload}`;
}

/** Sequential, matching the measurement method the milestone baseline used. */
async function generateLoad(
  a: ManagedInProcessReactor,
  driveId: string,
  options: LoadHarnessOptions,
  payloadSize: number,
): Promise<void> {
  for (let doc = 0; doc < options.documentCount; doc++) {
    for (let op = 0; op < options.opsPerDocument; op++) {
      await a.client.drives.addFolder(
        driveId,
        loadNodeName(doc, op, payloadSize),
      );
    }
  }
}

async function countLoadNodes(
  reactor: ManagedInProcessReactor,
  driveId: string,
): Promise<number> {
  try {
    const drive = await reactor.client.get<DocumentDriveDocument>(driveId);
    return drive.state.global.nodes.filter((node) =>
      node.name.startsWith(LOAD_NODE_PREFIX),
    ).length;
  } catch {
    return 0;
  }
}

type PropagationTracker = {
  /**
   * Resolves once B first holds at least one matching node, with the
   * ms-from-generation-start timestamp of that observation; resolves
   * `undefined` instead if `completed` settles before that ever happens
   * (e.g. `totalOps` was 0). Never rejects, so it is safe to leave unawaited.
   */
  firstOpArrivedMs: Promise<number | undefined>;
  /** Resolves with `endToEndMs` once B holds `targetCount` matching nodes; rejects on timeout. */
  completed: Promise<number>;
};

/**
 * Polls B from `start` (before generation on A begins, per the module doc)
 * until it holds `targetCount` nodes matching the load prefix, or until
 * `timeoutMs` elapses.
 */
function trackPropagation(
  b: ManagedInProcessReactor,
  driveId: string,
  targetCount: number,
  timeoutMs: number,
  pollIntervalMs: number,
): PropagationTracker {
  const start = now();

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
      for (;;) {
        const count = await countLoadNodes(b, driveId);
        if (count >= 1) {
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
