import type { StorageSessionRecreatedEvent } from "../events/types.js";
import type { IStorageHealthProvider, StorageHealth } from "./types.js";

/**
 * Tracks the DB-health dimension the inspector reports so a channel can never
 * again read "connected" while the reactor's PGlite session is dead (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md,
 * follow-up 3).
 *
 * It is fed by the self-heal path: the host marks it poisoned when the dialect
 * surfaces an unrecoverable session, and records each
 * {@link StorageSessionRecreatedEvent} the self-healing client emits, which
 * flips health back to true. `recreateCountOf` reads the live count off the
 * self-healing client when one is wired; absent that it falls back to the
 * highest `attempt` seen.
 */
export class StorageHealthTracker implements IStorageHealthProvider {
  private healthyFlag = true;
  private lastRecreatedEvent: StorageSessionRecreatedEvent | undefined =
    undefined;
  private highestAttempt = 0;
  private readonly recreateCountOf: (() => number) | undefined;

  constructor(recreateCountOf?: () => number) {
    this.recreateCountOf = recreateCountOf;
  }

  /** The dialect surfaced an unrecoverable session; health is now suspect. */
  markPoisoned(): void {
    this.healthyFlag = false;
  }

  /** A recreate succeeded: record it and treat the session as healthy again. */
  recordRecreated(event: StorageSessionRecreatedEvent): void {
    this.lastRecreatedEvent = event;
    this.highestAttempt = Math.max(this.highestAttempt, event.attempt);
    this.healthyFlag = true;
  }

  getStorageHealth(): StorageHealth {
    const recreateCount = this.recreateCountOf?.() ?? this.highestAttempt;
    return {
      healthy: this.healthyFlag,
      everRecreated: recreateCount > 0 || this.lastRecreatedEvent !== undefined,
      recreateCount,
      lastRecreated: this.lastRecreatedEvent,
    };
  }
}
