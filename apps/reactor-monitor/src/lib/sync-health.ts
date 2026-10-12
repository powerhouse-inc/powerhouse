import type { ConnectionStateSnapshot } from "@powerhousedao/reactor";

/**
 * How long a "connected" channel may go without a successful poll before its
 * green state is treated as a lie rather than a slow remote: a dead poll loop
 * can report `state: "connected"` with `lastSuccessUtcMs: 0` indefinitely.
 */
export const DEFAULT_STALE_THRESHOLD_MS = 2 * 60_000;

/**
 * True when a channel says "connected" but has never succeeded, or its last
 * success is older than `staleThresholdMs`.
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
