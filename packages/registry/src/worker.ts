// Runs jobs from registry_jobs until stopped. Any number of workers, in any
// number of processes, can share the queue.
import os from "node:os";
import { JOBS_CHANNEL } from "./events.js";
import type { Database, Queryable } from "./db/database.js";
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
  publishedHere,
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
    `SELECT to_regclass('verdaccio_manifests') IS NOT NULL
        AND to_regclass('verdaccio_packages') IS NOT NULL AS exists`,
  );
  return res.rows[0]?.exists === true;
}

// The index also holds packages cached from the uplink; only published ones are processed
const PUBLISHED =
  "EXISTS (SELECT 1 FROM verdaccio_packages l WHERE l.name = m.name)";

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
   WHERE m.updated_at < now() - interval '30 seconds' AND ${PUBLISHED}
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

// Every tagged version of every manifest: no row, or pending with no job for
// a while; untagged versions are processed when first requested
const FULL_MISSING = `
  SELECT DISTINCT m.name, v.version
    FROM verdaccio_manifests m
    CROSS JOIN LATERAL jsonb_each_text(m.dist_tags) AS v(tag, version)
    LEFT JOIN registry_versions r ON r.package = m.name AND r.version = v.version
   WHERE m.updated_at < now() - interval '30 seconds' AND ${PUBLISHED}
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
   WHERE m.updated_at < now() - interval '30 seconds' AND ${PUBLISHED}
     AND (p.name IS NULL OR NOT p.local OR p.dist_tags <> m.dist_tags
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

// Drops names an earlier import took from the uplink cache, with their queued and
// processed rows; one with an owner or a listing was published here and stays
export async function pruneCachedPackages(
  q: Queryable,
  published: string[],
): Promise<string[]> {
  const migrated = await q.query<{ exists: boolean }>(
    "SELECT to_regclass('registry_jobs') IS NOT NULL AS exists",
  );
  if (!migrated.rows[0]?.exists) return [];
  const res = await q.query<{ name: string }>(
    `DELETE FROM verdaccio_packages p
      WHERE p.name <> ALL($1::text[])
        AND NOT EXISTS (SELECT 1 FROM registry_package_owners o
                         WHERE o.package_name = p.name)
        AND NOT EXISTS (SELECT 1 FROM registry_packages r
                         WHERE r.name = p.name AND r.listed_manifest IS NOT NULL)
      RETURNING p.name`,
    [published],
  );
  const pruned = res.rows.map((row) => row.name);
  if (pruned.length) {
    await q.query(
      "DELETE FROM registry_jobs WHERE package = ANY($1) AND locked_by IS NULL",
      [pruned],
    );
    await q.query("DELETE FROM registry_versions WHERE package = ANY($1)", [
      pruned,
    ]);
    await q.query("DELETE FROM registry_packages WHERE name = ANY($1)", [
      pruned,
    ]);
  }
  return pruned;
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
  // Backfill is for packages published here; the uplink cache is processed on request
  if (
    job.priority === BACKGROUND_PRIORITY &&
    (await publishedHere(ctx.db, job.package)) === false
  ) {
    await ctx.db.transaction(finish);
    return;
  }
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
  // The first full pass waits a tick: rows a deploy's import just wrote are still too new
  let lastFull = Date.now() - SWEEP_INTERVAL_MS + RECONCILE_INTERVAL_MS;
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
