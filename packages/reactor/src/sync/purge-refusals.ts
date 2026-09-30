import type { SyncPurgeRefusedEvent } from "./types.js";

/** Refusals are persisted before PURGE_REFUSED fires, so a restart keeps them. */
export interface IPurgeRefusalRecorder {
  /** Rejects when the refusal was not persisted; the caller reports it again. */
  recordPurgeRefusal(refusal: SyncPurgeRefusedEvent): Promise<void>;
}

export function supportsPurgeRefusals(x: unknown): x is IPurgeRefusalRecorder {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { recordPurgeRefusal?: unknown }).recordPurgeRefusal ===
      "function"
  );
}
