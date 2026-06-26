import type { IEventBus, Unsubscribe } from "@powerhousedao/reactor";
import { FORWARDED_BUS_EVENT_TYPES } from "./forwarded-events.js";
import { KeyedListeners } from "./listeners.js";
import type { MessageRouter } from "./message-router.js";

type BusSubscriber = (type: number, event: unknown) => void | Promise<void>;

/** Tab-side IEventBus over bus-event; emit() is unsupported (the worker emits). */
export class ReactorEventBusProxy implements IEventBus {
  private readonly forwardedTypes = new Set<number>(FORWARDED_BUS_EVENT_TYPES);
  private readonly subscribers = new KeyedListeners<
    number,
    [number, unknown]
  >();

  constructor(router: MessageRouter) {
    router.on("bus-event", (msg) => {
      this.subscribers.emit(msg.eventType, msg.eventType, msg.event);
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
    const entry = subscriber as BusSubscriber;
    return this.subscribers.add(
      type,
      entry as (eventType: number, event: unknown) => void,
    );
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
