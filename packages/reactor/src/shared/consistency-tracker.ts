import type { ConsistencyCoordinate, ConsistencyKey } from "./types.js";

export interface IConsistencyTracker {
  /**
   * Updates the tracker with new operation indexes.
   * When multiple coordinates have the same key, keeps the highest operationIndex.
   * Resolves any pending waiters whose coordinates are now satisfied.
   */
  update(coordinates: ConsistencyCoordinate[]): void;

  /**
   * Returns the latest operation index for a given key, or undefined if not tracked.
   */
  getLatest(key: ConsistencyKey): number | undefined;

  /**
   * Returns a promise that resolves when all coordinates are satisfied.
   * Rejects if the timeout is reached or the signal is aborted.
   */
  waitFor(
    coordinates: ConsistencyCoordinate[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * Returns a serializable snapshot of the current state.
   */
  serialize(): Array<[ConsistencyKey, number]>;

  /**
   * Restores state from a serialized snapshot.
   */
  hydrate(entries: Array<[ConsistencyKey, number]>): void;
}

type Waiter = {
  coordinates: ConsistencyCoordinate[];
  resolve: () => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  timeoutId?: NodeJS.Timeout;
};

/**
 * Creates a consistency key from documentId, scope, and branch.
 */
export function makeConsistencyKey(
  documentId: string,
  scope: string,
  branch: string,
): ConsistencyKey {
  return `${documentId}:${scope}:${branch}`;
}

/**
 * Tracks operation indexes for documents and provides read-after-write consistency guarantees.
 * Maintains an in-memory map of the latest operation index for each (documentId, scope, branch) tuple.
 */
export class ConsistencyTracker implements IConsistencyTracker {
  private state = new Map<ConsistencyKey, number>();
  private waiters: Waiter[] = [];

  update(coordinates: ConsistencyCoordinate[]): void {
    const deduplicated = this.deduplicateCoordinates(coordinates);

    for (let i = 0; i < deduplicated.length; i++) {
      const coord = deduplicated[i]!;
      const key = makeConsistencyKey(
        coord.documentId,
        coord.scope,
        coord.branch,
      );
      const current = this.state.get(key);
      if (current === undefined || coord.operationIndex > current) {
        this.state.set(key, coord.operationIndex);
      }
    }

    this.checkWaiters();
  }

  getLatest(key: ConsistencyKey): number | undefined {
    return this.state.get(key);
  }

  waitFor(
    coordinates: ConsistencyCoordinate[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }

    if (this.areCoordinatesSatisfied(coordinates)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        coordinates,
        resolve,
        reject,
        signal,
      };

      if (timeoutMs !== undefined) {
        waiter.timeoutId = setTimeout(() => {
          this.removeWaiter(waiter);
          reject(new Error(`Consistency wait timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      if (signal) {
        const abortHandler = () => {
          this.removeWaiter(waiter);
          reject(new Error("Operation aborted"));
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.waiters.push(waiter);
    });
  }

  serialize(): Array<[ConsistencyKey, number]> {
    return Array.from(this.state.entries());
  }

  hydrate(entries: Array<[ConsistencyKey, number]>): void {
    this.state.clear();
    for (const [key, index] of entries) {
      this.state.set(key, index);
    }
  }

  private deduplicateCoordinates(
    coordinates: ConsistencyCoordinate[],
  ): ConsistencyCoordinate[] {
    const map = new Map<ConsistencyKey, ConsistencyCoordinate>();

    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i]!;
      const key = makeConsistencyKey(
        coord.documentId,
        coord.scope,
        coord.branch,
      );
      const existing = map.get(key);

      if (!existing || coord.operationIndex > existing.operationIndex) {
        map.set(key, coord);
      }
    }

    return Array.from(map.values());
  }

  private areCoordinatesSatisfied(
    coordinates: ConsistencyCoordinate[],
  ): boolean {
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i]!;
      const key = makeConsistencyKey(
        coord.documentId,
        coord.scope,
        coord.branch,
      );
      const latest = this.state.get(key);
      if (latest === undefined || latest < coord.operationIndex) {
        return false;
      }
    }
    return true;
  }

  private checkWaiters(): void {
    const satisfiedWaiters: Waiter[] = [];
    const unsatisfiedWaiters: Waiter[] = [];

    for (const waiter of this.waiters) {
      if (waiter.signal?.aborted) {
        continue;
      }

      if (this.areCoordinatesSatisfied(waiter.coordinates)) {
        satisfiedWaiters.push(waiter);
      } else {
        unsatisfiedWaiters.push(waiter);
      }
    }

    this.waiters = unsatisfiedWaiters;

    for (const waiter of satisfiedWaiters) {
      if (waiter.timeoutId !== undefined) {
        clearTimeout(waiter.timeoutId);
      }
      waiter.resolve();
    }
  }

  private removeWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index !== -1) {
      this.waiters.splice(index, 1);
    }
    if (waiter.timeoutId !== undefined) {
      clearTimeout(waiter.timeoutId);
    }
  }
}
