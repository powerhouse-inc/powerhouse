import type { IEventBus, Unsubscribe } from "@powerhousedao/reactor";
import { FORWARDED_BUS_EVENT_TYPES } from "./forwarded-events.js";
import type { MessageRouter } from "./message-router.js";

type BusSubscriber = (type: number, event: unknown) => void | Promise<void>;

/** Tab-side IEventBus over bus-event; emit() is unsupported (the worker emits). */
export class ReactorEventBusProxy implements IEventBus {
  private readonly forwardedTypes = new Set<number>(FORWARDED_BUS_EVENT_TYPES);
  private readonly subscribers = new Map<number, Set<BusSubscriber>>();

  constructor(router: MessageRouter) {
    router.on("bus-event", (msg) => {
      const set = this.subscribers.get(msg.eventType);
      if (set) {
        for (const subscriber of [...set]) {
          void subscriber(msg.eventType, msg.event);
        }
      }
    });
  }

  subscribe<K>(
    type: number,
    subscriber: (type: number, event: K) => void | Promise<void>,
  ): Unsubscribe {
    if (!this.forwardedTypes.has(type)) {
      throw new Error(
        `ReactorEventBusProxy cannot subscribe to event type ${type}: the worker forwards only [${[...this.forwardedTypes].join(", ")}]`,
      );
    }
    let set = this.subscribers.get(type);
    if (!set) {
      set = new Set();
      this.subscribers.set(type, set);
    }
    const entry = subscriber as BusSubscriber;
    set.add(entry);
    return () => {
      set.delete(entry);
    };
  }

  emit(): Promise<void> {
    return Promise.reject(
      new Error(
        "EventBus.emit is not supported tab-side; the reactor graph emits in the worker",
      ),
    );
  }
}

export function createReactorEventBusProxy(router: MessageRouter): IEventBus {
  return new ReactorEventBusProxy(router);
}
