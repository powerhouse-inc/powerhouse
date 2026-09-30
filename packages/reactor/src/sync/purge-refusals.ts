import type { SyncPurgeRefusedEvent } from "./types.js";

/** The most refusals a poll reports; the rest wait for the next poll. */
export const MAX_POLLED_REFUSALS = 100;

export type PolledMarkerRefusal = { documentId: string; branch: string };

/** Refusals are persisted before PURGE_REFUSED fires, so a restart keeps them. */
export interface IPurgeRefusalRecorder {
  /** Rejects when the refusal was not persisted; the caller reports it again. */
  recordPurgeRefusal(refusal: SyncPurgeRefusedEvent): Promise<void>;
  /**
   * A poller's marker refusals, at most {@link MAX_POLLED_REFUSALS}. Only a
   * tombstoned document in the remote's collection was owed its marker; any
   * other is dropped. Rejects when the refusals were not persisted.
   */
  recordPolledMarkerRefusals(
    remoteName: string,
    refusals: readonly PolledMarkerRefusal[],
  ): Promise<void>;
}

export function supportsPurgeRefusals(x: unknown): x is IPurgeRefusalRecorder {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { recordPurgeRefusal?: unknown }).recordPurgeRefusal ===
      "function" &&
    typeof (x as { recordPolledMarkerRefusals?: unknown })
      .recordPolledMarkerRefusals === "function"
  );
}
