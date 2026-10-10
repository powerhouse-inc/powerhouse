import type { ConnectionStateSnapshot } from "@powerhousedao/reactor";

/**
 * How long a "connected" channel may go without a successful poll before its
 * green state is treated as a lie rather than a slow remote. Today's soak
 * (docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md,
 * addendum 2) found a channel reporting `state: "connected"` with
 * `lastSuccessUtcMs: 0` indefinitely — a dead poll loop that never threw and
 * never polled. The inspector must not repeat that lie.
 */
export const DEFAULT_STALE_THRESHOLD_MS = 2 * 60_000;

/**
 * True when a channel's `state` says "connected" but its own timestamps
 * contradict that: either it has never once succeeded
 * (`lastSuccessUtcMs === 0` — exactly the state the bug report caught, a
 * channel reporting "connected" with zero successful polls since boot), or
 * its last success is older than `staleThresholdMs` (the poll loop died
 * silently after an earlier success).
 */
export function isConnectionLying(
  snapshot: ConnectionStateSnapshot,
  nowMs: number = Date.now(),
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): boolean {
  if (snapshot.state !== "connected") {
    return false;
  }
  if (snapshot.lastSuccessUtcMs === 0) {
    return true;
  }
  return nowMs - snapshot.lastSuccessUtcMs > staleThresholdMs;
}
