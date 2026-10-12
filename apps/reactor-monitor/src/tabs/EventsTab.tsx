/**
 * Live event feed over `ManagedReactor.events` (an `IEventBus`, added to the
 * provisioning library for this tab — see packages/reactor-monitor/src/types.ts).
 *
 * Subscribes only to `FORWARDED_EVENT_TYPES`: a worker-hosted reactor's bus
 * is a proxy that forwards exactly that set and throws synchronously on any
 * other type (see `@powerhousedao/reactor-browser/rpc`'s
 * `ReactorEventBusProxy`), so sticking to it is what keeps this tab working
 * identically for both reactor kinds.
 */
import {
  ReactorEventTypes,
  SyncEventTypes,
  type IEventBus,
} from "@powerhousedao/reactor";
import { FORWARDED_EVENT_TYPES } from "@powerhousedao/reactor-browser/rpc";
import { useEffect, useState } from "react";

export type EventsTabProps = {
  readonly events: IEventBus;
};

const EVENT_NAMES = new Map<number, string>([
  [SyncEventTypes.SYNC_PENDING, "SYNC_PENDING"],
  [SyncEventTypes.SYNC_SUCCEEDED, "SYNC_SUCCEEDED"],
  [SyncEventTypes.SYNC_FAILED, "SYNC_FAILED"],
  [SyncEventTypes.DEAD_LETTER_ADDED, "DEAD_LETTER_ADDED"],
  [SyncEventTypes.CONNECTION_STATE_CHANGED, "CONNECTION_STATE_CHANGED"],
  [ReactorEventTypes.MODEL_LOADED, "MODEL_LOADED"],
]);

const MAX_EVENTS = 200;

type FeedEntry = {
  id: number;
  receivedAtMs: number;
  type: number;
  payload: unknown;
};

export function EventsTab({ events }: EventsTabProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return;
    }
    let nextId = 0;
    const unsubscribes = FORWARDED_EVENT_TYPES.map((type) =>
      events.subscribe(type, (eventType, payload) => {
        setEntries((previous) => {
          const entry: FeedEntry = {
            id: nextId++,
            receivedAtMs: Date.now(),
            type: eventType,
            payload,
          };
          return [entry, ...previous].slice(0, MAX_EVENTS);
        });
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [events, paused]);

  return (
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Events</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            onClick={() => setPaused((p) => !p)}
            type="button"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            className="rm-btn"
            onClick={() => setEntries([])}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="rm-note">
        Forwarding {FORWARDED_EVENT_TYPES.length} event type(s): sync lifecycle
        and model-load events. ({entries.length} received)
      </p>
      {entries.length === 0 ? (
        <p className="rm-placeholder">No events yet.</p>
      ) : (
        <ul className="rm-event-feed">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="rm-event-time">
                {new Date(entry.receivedAtMs).toLocaleTimeString()}
              </span>
              <span className="rm-badge">
                {EVENT_NAMES.get(entry.type) ?? entry.type}
              </span>
              <pre className="rm-json">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EventsTab;
