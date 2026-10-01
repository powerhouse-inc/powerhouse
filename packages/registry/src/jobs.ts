// The job queue: rows in registry_jobs, claimed with SKIP LOCKED so any number
// of workers can share it, and retried with backoff until MAX_ATTEMPTS.
import type { Database, Queryable } from "./db/database.js";
import { JOBS_CHANNEL } from "./events.js";

export type JobKind = "process" | "sync";

export interface Job {
  id: string;
  kind: JobKind;
  package: string;
  version: string;
  payload: Record<string, unknown>;
  attempts: number;
  priority: number;
}

export const MAX_ATTEMPTS = 5;
/** Versions of packages published elsewhere, processed on request */
export const ON_DEMAND_PRIORITY = 5;
/** Behind every publish and on-demand job */
export const BACKGROUND_PRIORITY = 10;
// A worker that died mid-job leaves its lock; after this another may take it
const LOCK_TIMEOUT_SECONDS = 300;

/** Queues a job; one already queued for the same target is run again instead. */
export async function enqueue(
  q: Queryable,
  kind: JobKind,
  packageName: string,
  version = "",
  payload: Record<string, unknown> = {},
  priority = 0,
): Promise<void> {
  await q.query(
    `INSERT INTO registry_jobs (kind, package, version, payload, priority)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kind, package, version) DO UPDATE
       SET requeued = registry_jobs.locked_by IS NOT NULL,
           run_after = LEAST(registry_jobs.run_after, now()),
           payload = registry_jobs.payload || EXCLUDED.payload,
           priority = LEAST(registry_jobs.priority, EXCLUDED.priority)`,
    [kind, packageName, version, JSON.stringify(payload), priority],
  );
}

/** Queues a job unless one exists, leaving its backoff alone; true if queued. */
export async function ensureJob(
  q: Queryable,
  kind: JobKind,
  packageName: string,
  version = "",
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO registry_jobs (kind, package, version)
     VALUES ($1, $2, $3)
     ON CONFLICT (kind, package, version) DO NOTHING
     RETURNING id::text`,
    [kind, packageName, version],
  );
  return result.rows.length > 0;
}

/** Wakes idle workers; call after the enqueuing transaction commits. */
export function wakeWorkers(db: Database): Promise<void> {
  return db.notify(JOBS_CHANNEL, "");
}

export async function claim(
  db: Database,
  workerId: string,
): Promise<Job | null> {
  const result = await db.query<Job>(
    `UPDATE registry_jobs
        SET locked_by = $1, locked_at = now(), attempts = attempts + 1, requeued = false
      WHERE id = (
        SELECT id FROM registry_jobs
         WHERE run_after <= now()
           AND (locked_by IS NULL OR locked_at < now() - make_interval(secs => $2))
         ORDER BY priority, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED)
      RETURNING id::text, kind, package, version, payload, attempts, priority`,
    [workerId, LOCK_TIMEOUT_SECONDS],
  );
  return result.rows[0] ?? null;
}

/** Removes a finished job, or releases it when it was queued again meanwhile. */
export async function complete(q: Queryable, job: Job): Promise<void> {
  await q.query(`DELETE FROM registry_jobs WHERE id = $1 AND NOT requeued`, [
    job.id,
  ]);
  await q.query(
    `UPDATE registry_jobs SET locked_by = NULL, locked_at = NULL, attempts = 0
      WHERE id = $1`,
    [job.id],
  );
}

/** Schedules the next attempt, backing off exponentially. */
export async function retry(
  db: Database,
  job: Job,
  error: string,
): Promise<void> {
  const delaySeconds = 2 ** job.attempts * 5;
  await db.query(
    `UPDATE registry_jobs
        SET locked_by = NULL, locked_at = NULL, last_error = $2,
            run_after = now() + make_interval(secs => $3)
      WHERE id = $1`,
    [job.id, error, delaySeconds],
  );
}
