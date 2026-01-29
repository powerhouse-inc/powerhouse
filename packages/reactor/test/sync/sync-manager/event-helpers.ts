import type { IEventBus } from "../../../src/events/interfaces.js";
import type { Unsubscribe } from "../../../src/events/types.js";
import {
  SyncEventTypes,
  type SyncFailedEvent,
  type SyncPendingEvent,
  type SyncSucceededEvent,
} from "../../../src/sync/types.js";

type SyncEvent =
  | { type: "SYNC_PENDING"; data: SyncPendingEvent }
  | { type: "SYNC_SUCCEEDED"; data: SyncSucceededEvent }
  | { type: "SYNC_FAILED"; data: SyncFailedEvent };

type EventCollector = {
  events: SyncEvent[];
  cleanup: () => void;
};

/**
 * Creates an event collector that subscribes to all sync events and stores them for verification.
 */
export function createEventCollector(eventBus: IEventBus): EventCollector {
  const events: SyncEvent[] = [];
  const unsubscribes: Unsubscribe[] = [];

  unsubscribes.push(
    eventBus.subscribe(
      SyncEventTypes.SYNC_PENDING,
      (_type: number, data: SyncPendingEvent) => {
        events.push({ type: "SYNC_PENDING", data });
      },
    ),
  );

  unsubscribes.push(
    eventBus.subscribe(
      SyncEventTypes.SYNC_SUCCEEDED,
      (_type: number, data: SyncSucceededEvent) => {
        events.push({ type: "SYNC_SUCCEEDED", data });
      },
    ),
  );

  unsubscribes.push(
    eventBus.subscribe(
      SyncEventTypes.SYNC_FAILED,
      (_type: number, data: SyncFailedEvent) => {
        events.push({ type: "SYNC_FAILED", data });
      },
    ),
  );

  const cleanup = () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };

  return { events, cleanup };
}

/**
 * Returns events for a specific jobId.
 */
export function getEventsForJob(
  events: SyncEvent[],
  jobId: string,
): SyncEvent[] {
  return events.filter((e) => e.data.jobId === jobId);
}

/**
 * Returns terminal events (SUCCEEDED or FAILED) for a specific jobId.
 */
export function getTerminalEventsForJob(
  events: SyncEvent[],
  jobId: string,
): SyncEvent[] {
  return events.filter(
    (e) =>
      e.data.jobId === jobId &&
      (e.type === "SYNC_SUCCEEDED" || e.type === "SYNC_FAILED"),
  );
}
