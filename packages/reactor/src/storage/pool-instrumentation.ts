import type { Pool, PoolClient } from "pg";

/**
 * Snapshot of a pg.Pool's internal counters at a point in time.
 */
export type PoolStats = {
  /** Connections currently open (idle + in-use). pg.Pool.totalCount. */
  size: number;
  /** Open connections not currently checked out. pg.Pool.idleCount. */
  idle: number;
  /** Callers queued waiting for a connection. pg.Pool.waitingCount. */
  waiting: number;
};

/**
 * Observable handle over an instrumented pg.Pool. Surfaces acquire-wait
 * timing and pool-stat counters without coupling the consumer to the
 * underlying pg.Pool type.
 */
export type PoolInstrumentation = {
  /** Stable identifier for the pool (e.g. "host", "worker"). Used as a metric label. */
  readonly name: string;
  /** Current pool counters. Cheap, synchronous read off pg.Pool. */
  getStats(): PoolStats;
  /**
   * Subscribe to per-acquire wait durations. Listener fires once per
   * resolved pool.connect() call with the time spent waiting for a client.
   * Returns an unsubscribe function.
   */
  onAcquire(listener: (durationMs: number) => void): () => void;
};

/**
 * Wraps an existing pg.Pool with acquire-wait timing and an event
 * subscription surface. The pool is mutated in place: pool.connect()
 * is replaced with a timing wrapper so all callers (Kysely included)
 * pick up the instrumentation transparently.
 */
export function instrumentPgPool(
  pool: Pool,
  name: string,
): PoolInstrumentation {
  const listeners = new Set<(durationMs: number) => void>();
  const originalConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  const wrappedConnect = async (): Promise<PoolClient> => {
    const start = performance.now();
    const client = await originalConnect();
    const durationMs = performance.now() - start;
    for (const listener of listeners) {
      try {
        listener(durationMs);
      } catch {
        // listener failures must not break the acquire path
      }
    }
    return client;
  };
  pool.connect = wrappedConnect as typeof pool.connect;
  return {
    name,
    getStats(): PoolStats {
      return {
        size: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      };
    },
    onAcquire(listener: (durationMs: number) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Host-side {@link PoolInstrumentation} that re-emits acquire-wait samples
 * and pool-stat snapshots forwarded from a worker thread. The worker owns
 * the real pg.Pool; this object lets the host's OpenTelemetry instrumentation
 * subscribe to those events as if the pool were local.
 *
 * The host wires one of these per worker (one per executor worker, one per
 * projection shard). The worker batches acquire-wait durations and periodic
 * stats over its existing transport; the host pumps them in via
 * {@link pushSamples} / {@link updateStats}.
 */
export type ForwardingPoolInstrumentation = PoolInstrumentation & {
  pushSamples(durations: number[]): void;
  updateStats(stats: PoolStats): void;
};

export function createForwardingPoolInstrumentation(
  name: string,
): ForwardingPoolInstrumentation {
  const listeners = new Set<(durationMs: number) => void>();
  let stats: PoolStats = { size: 0, idle: 0, waiting: 0 };
  return {
    name,
    getStats(): PoolStats {
      return stats;
    },
    onAcquire(listener: (durationMs: number) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pushSamples(durations: number[]): void {
      for (const durationMs of durations) {
        for (const listener of listeners) {
          try {
            listener(durationMs);
          } catch {
            // listener failures must not break sample forwarding
          }
        }
      }
    },
    updateStats(next: PoolStats): void {
      stats = next;
    },
  };
}
