import type { OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export type BusEventListener = (event: unknown) => void;

export type ReactorEventBusProxy = {
  on(eventType: number, listener: BusEventListener): () => void;
};

// Tab-side view of the worker's reactor IEventBus: dispatches forwarded
// bus events to listeners by numeric event type.
export function createReactorEventBusProxy(
  transport: IRpcTransport,
): ReactorEventBusProxy {
  const listeners = new Map<number, Set<BusEventListener>>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k !== "bus-event") {
      return;
    }
    const set = listeners.get(msg.eventType);
    if (set) {
      for (const listener of [...set]) {
        listener(msg.event);
      }
    }
  });

  return {
    on(eventType, listener) {
      let set = listeners.get(eventType);
      if (!set) {
        set = new Set();
        listeners.set(eventType, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  };
}
