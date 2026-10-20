import { probeRun } from "@powerhousedao/host-core";

/* Kept out of clint-runner.ts: a runner module exports only its verb
 * functions (plus schemas and constants). */

/** How often {@link awaitRunRecord} re-reads a member's run record. */
const RECORD_POLL_MS = 100;

/** A member whose outputs something reads, and what it waits for. */
export interface RecordWait {
  /** The child key (`children.<id>`). */
  id: string;
  /** The member host's `name` (its record is `.ph/run/<host>.json`). */
  host: string;
  /** How long to wait, in ms (the member's readiness timeout). */
  timeout: number;
  /** Who reads the member's outputs, for the error. */
  readers: string[];
  /** The member's service state, when clint started it: a `failed` or
   * `stopped` member will never publish, so the wait ends early. */
  status?: () => string | undefined;
}

/**
 * Waits for a started member's LIVE run record. A member counts as up when
 * its stdout matches the readiness pattern, but `ph run` writes the member's
 * run record only after the runner's `ready` resolves, so a reader that
 * looks right after the readiness line can find none. Polls until the
 * record is live, the member's service fails or stops, or `timeout` passes;
 * then throws naming the member, its record, the timeout and its readers.
 * An earlier run's stale record does not count: it is waited past.
 */
export async function awaitRunRecord(
  projectRoot: string,
  projectName: string,
  consumer: string,
  wait: RecordWait,
  pollMs = RECORD_POLL_MS,
): Promise<void> {
  const deadline = Date.now() + wait.timeout;
  for (;;) {
    if (probeRun(projectRoot, wait.host, projectName).status === "live") {
      return;
    }
    const status = wait.status?.();
    const gone = status === "failed" || status === "stopped";
    if (gone || Date.now() >= deadline) {
      const why = gone
        ? `${status} before publishing its live run record`
        : `published no live run record within ${wait.timeout} ms (children.${wait.id}.config.readiness.timeout)`;
      throw new Error(
        `hosts/${consumer}/host.js: member "${wait.id}" is up (its readiness line matched) but ${why} (.ph/run/${wait.host}.json); ${wait.readers.join(", ")} read its outputs.`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))),
    );
  }
}
