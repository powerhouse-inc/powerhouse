import type { IEventBus, Unsubscribe } from "@powerhousedao/reactor";
import { FORWARDED_BUS_EVENT_TYPES } from "./forwarded-events.js";
import type { OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

type BusSubscriber = (type: number, event: unknown) => void | Promise<void>;

// emit() is unsupported tab-side; the worker is the sole emitter.
export class ReactorEventBusProxy implements IEventBus {
  private readonly forwardedTypes = new Set<number>(FORWARDED_BUS_EVENT_TYPES);
  private readonly subscribers = new Map<number, Set<BusSubscriber>>();

  constructor(transport: IRpcTransport) {
    transport.onMessage((message) => {
      const msg = message as OwnerMessage;
      if (msg.k !== "bus-event") {
        return;
      }
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

export function createReactorEventBusProxy(
  transport: IRpcTransport,
): IEventBus {
  return new ReactorEventBusProxy(transport);
}
