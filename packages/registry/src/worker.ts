// Runs jobs from registry_jobs until stopped. Any number of workers, in any
// number of processes, can share the queue.
import os from "node:os";
import { JOBS_CHANNEL } from "./events.js";
import type { Database } from "./db/database.js";
import {
  BACKGROUND_PRIORITY,
  claim,
  complete,
  enqueue,
  MAX_ATTEMPTS,
  retry,
  wakeWorkers,
  type Job,
} from "./jobs.js";
import type { WorkerMetrics } from "./metrics.js";
import type { PublisherIdentity } from "./notifications/types.js";
import type { WebhookStore } from "./notifications/webhook.js";
import {
  failVersion,
  PermanentError,
  processVersion,
  syncPackage,
  type ProcessorContext,
} from "./processor.js";

const IDLE_POLL_MS = 2_000;
// Reconciling by revision is a join per package; comparing every version,
// or fetching every package's metadata without the index, runs hourly
const RECONCILE_INTERVAL_MS = 60_000;
const SWEEP_INTERVAL_MS = 60 * 60_000;

export interface WorkerOptions {
  concurrency: number;
  webhooks?: WebhookStore;
  /** Whether this worker reconciles with Verdaccio's storage periodically */
  sweep?: boolean;
  metrics?: WorkerMetrics;
}

/** Queues a sync of every package published to this registry. */
export async function enqueueSweep(db: Database): Promise<number> {
  const verdaccio = await db.query<{ exists: boolean }>(
    "SELECT to_regclass('verdaccio_packages') IS NOT NULL AS exists",
  );
  const names = await db.query<{ name: string }>(
    `SELECT package_name AS name FROM registry_package_owners
     UNION SELECT name FROM registry_packages WHERE local
     ${verdaccio.rows[0]?.exists ? "UNION SELECT name FROM verdaccio_packages" : ""}`,
  );
  for (const { name } of names.rows) {
    await enqueue(db, "sync", name, "", { local: true }, BACKGROUND_PRIORITY);
  }
  if (names.rows.length > 0) await wakeWorkers(db);
  return names.rows.length;
}

async function hasManifestIndex(db: Database): Promise<boolean> {
  const res = await db.query<{ exists: boolean }>(
    "SELECT to_regclass('verdaccio_manifests') IS NOT NULL AS exists",
  );
  return res.rows[0]?.exists === true;
}

// Local packages whose manifest index row is gone: unpublished
const UNPUBLISHED = `
  SELECT p.name FROM registry_packages p
   WHERE p.local AND p.updated_at < now() - interval '30 seconds'
     AND NOT EXISTS (SELECT 1 FROM verdaccio_manifests m WHERE m.name = p.name)`;

// Per package: a revision no sync has applied yet
const QUICK_CHANGED = `
  SELECT m.name
    FROM verdaccio_manifests m
    LEFT JOIN registry_packages p ON p.name = m.name
   WHERE m.updated_at < now() - interval '30 seconds'
     AND (p.name IS NULL OR p.manifest_rev IS DISTINCT FROM m.rev)
  UNION ${UNPUBLISHED}
   LIMIT 1000`;

// Versions left pending with no job to process them
const QUICK_MISSING = `
  SELECT r.package AS name, r.version
    FROM registry_versions r
   WHERE r.status = 'pending' AND r.updated_at < now() - interval '5 minutes'
     AND NOT EXISTS (SELECT 1 FROM registry_jobs j
                      WHERE j.kind = 'process' AND j.package = r.package
                        AND j.version = r.version)
   LIMIT 1000`;

// Every version of every manifest: published versions with no row, or
// pending with no job for a while
const FULL_MISSING = `
  SELECT m.name, v.version
    FROM verdaccio_manifests m
    CROSS JOIN LATERAL jsonb_array_elements_text(m.versions) AS v(version)
    LEFT JOIN registry_versions r ON r.package = m.name AND r.version = v.version
   WHERE m.updated_at < now() - interval '30 seconds'
     AND (r.package IS NULL
       OR (r.status = 'pending' AND r.updated_at < now() - interval '5 minutes'
           AND NOT EXISTS (SELECT 1 FROM registry_jobs j
                            WHERE j.kind = 'process' AND j.package = m.name
                              AND j.version = v.version)))
   LIMIT 1000`;

// Packages whose tags or versions moved, whatever their revision says
const FULL_CHANGED = `
  SELECT m.name
    FROM verdaccio_manifests m
    LEFT JOIN registry_packages p ON p.name = m.name
   WHERE m.updated_at < now() - interval '30 seconds'
     AND (p.name IS NULL OR p.dist_tags <> m.dist_tags
       OR EXISTS (SELECT 1 FROM registry_versions r
                   WHERE r.package = m.name AND NOT m.versions ? r.version))
  UNION ${UNPUBLISHED}
   LIMIT 1000`;

// Queues what differs from the storage plugin's manifest index, by revision or,
// with `full`, by every version; null when there is no index to compare with
export async function reconcile(
  db: Database,
  options: { full?: boolean } = {},
): Promise<number | null> {
  if (!(await hasManifestIndex(db))) return null;
  const missing = await db.query<{ name: string; version: string }>(
    options.full ? FULL_MISSING : QUICK_MISSING,
  );
  const changed = await db.query<{ name: string }>(
    options.full ? FULL_CHANGED : QUICK_CHANGED,
  );
  for (const { name, version } of missing.rows) {
    await enqueue(
      db,
      "process",
      name,
      version,
      { local: true },
      BACKGROUND_PRIORITY,
    );
  }
  for (const { name } of changed.rows) {
    await enqueue(db, "sync", name, "", { local: true }, BACKGROUND_PRIORITY);
  }
  const queued = missing.rows.length + changed.rows.length;
  if (queued > 0) await wakeWorkers(db);
  return queued;
}

export interface RunningWorker {
  stop(): Promise<void>;
}

function publisherOf(job: Job): PublisherIdentity | undefined {
  const by = job.payload.publishedBy as PublisherIdentity | undefined;
  return by?.address ? by : undefined;
}

async function runJob(
  ctx: ProcessorContext,
  job: Job,
  options: WorkerOptions,
): Promise<void> {
  const finish = (tx: Parameters<typeof complete>[0]) => complete(tx, job);
  if (job.kind === "process") {
    const processed = await processVersion(ctx, job, finish);
    if (processed && job.payload.notify === true) {
      await options.webhooks?.notifyPublish({
        packageName: job.package,
        version: job.version,
        publishedBy: publisherOf(job),
      });
    }
    return;
  }
  const removed = await syncPackage(ctx, job, finish);
  if (job.payload.notify !== true || !options.webhooks) return;
  if (removed === null) {
    await options.webhooks.notifyUnpublish({
      packageName: job.package,
      version: null,
      publishedBy: publisherOf(job),
    });
    return;
  }
  for (const version of removed) {
    await options.webhooks.notifyUnpublish({
      packageName: job.package,
      version,
      publishedBy: publisherOf(job),
    });
  }
}

export async function startWorker(
  ctx: ProcessorContext,
  options: WorkerOptions,
): Promise<RunningWorker> {
  const workerId = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  let stopped = false;
  const sleepers = new Set<() => void>();
  const wakeAll = () => {
    for (const wake of sleepers) wake();
  };
  const unlisten = await ctx.db.listen(JOBS_CHANNEL, wakeAll);

  const idle = () =>
    new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        sleepers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, IDLE_POLL_MS);
      sleepers.add(wake);
    });

  const loop = async () => {
    while (!stopped) {
      let job: Job | null;
      try {
        job = await claim(ctx.db, workerId);
      } catch (err) {
        console.error("[registry] claiming a job failed:", err);
        await idle();
        continue;
      }
      if (!job) {
        await idle();
        continue;
      }
      const started = performance.now();
      const observe = (outcome: string) =>
        options.metrics?.jobDuration.observe(
          { kind: job.kind, outcome },
          (performance.now() - started) / 1000,
        );
      try {
        await runJob(ctx, job, options);
        observe("done");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[registry] ${job.kind} ${job.package}${job.version ? `@${job.version}` : ""} failed (attempt ${job.attempts}):`,
          message,
        );
        // Failed before the job goes, so a crash here can't strand a version
        const finalAttempt =
          err instanceof PermanentError || job.attempts >= MAX_ATTEMPTS;
        observe(finalAttempt ? "failed" : "retry");
        try {
          if (!finalAttempt) {
            await retry(ctx.db, job, message);
          } else {
            if (job.kind === "process") await failVersion(ctx, job, message);
            await complete(ctx.db, job);
          }
        } catch (recordErr) {
          console.error(
            "[registry] recording a job failure failed:",
            recordErr,
          );
          await idle();
        }
      }
    }
  };

  const loops = Array.from({ length: Math.max(1, options.concurrency) }, () =>
    loop(),
  );
  let sweeper: ReturnType<typeof setTimeout> | undefined;
  let lastFull = 0;
  const sweep = async () => {
    try {
      const full = Date.now() - lastFull >= SWEEP_INTERVAL_MS;
      const queued = await reconcile(ctx.db, { full });
      if (full) lastFull = Date.now();
      if (queued !== null) {
        const pass = { pass: full ? "full" : "quick" };
        options.metrics?.reconcileRuns.inc(pass);
        options.metrics?.reconcileQueued.inc(pass, queued);
      }
      // Repeated nonzero counts point at missed hooks or a stuck package
      if (queued) console.warn(`[registry] reconcile queued ${queued} jobs`);
      if (queued === null && full) await enqueueSweep(ctx.db);
    } catch (err) {
      console.error("[registry] reconciling failed:", err);
    }
    if (!stopped)
      sweeper = setTimeout(() => void sweep(), RECONCILE_INTERVAL_MS);
  };
  if (options.sweep) void sweep();
  return {
    async stop() {
      stopped = true;
      clearTimeout(sweeper);
      wakeAll();
      await unlisten();
      await Promise.allSettled(loops);
    },
  };
}
