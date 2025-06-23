import { IEventBus } from "./interfaces.js";
import { EventBusAggregateError, Subscriber, Unsubscribe } from "./types.js";

export class EventBus implements IEventBus {
  private eventTypeToSubscribers: Map<number, Subscriber[]> = new Map();

  subscribe<K>(
    type: number,
    subscriber: (type: number, event: K) => void | Promise<void>,
  ): Unsubscribe {
    let list = this.eventTypeToSubscribers.get(type);
    if (!list) {
      list = [];
      this.eventTypeToSubscribers.set(type, list);
    }
    list.push(subscriber as Subscriber);

    let done = false;
    return () => {
      if (done) {
        return;
      }
      done = true;

      const arr = this.eventTypeToSubscribers.get(type);
      if (!arr) {
        return;
      }

      const idx = arr.indexOf(subscriber as Subscriber);
      if (idx !== -1) {
        arr.splice(idx, 1);
      }
      if (arr.length === 0) {
        this.eventTypeToSubscribers.delete(type);
      }
    };
  }

  async emit(type: number, data: any): Promise<void> {
    const list = this.eventTypeToSubscribers.get(type);
    if (!list || list.length === 0) {
      return;
    }

    // Snapshot ensures subscribers added/removed during emit don't affect this cycle.
    const snapshot = list.slice();

    // Call each subscriber sequentially and collect any errors
    const errors: any[] = [];
    for (const fn of snapshot) {
      try {
        await Promise.resolve(fn(type, data));
      } catch (err) {
        errors.push(err);
      }
    }

    // If any errors occurred, throw an aggregate error containing all of them
    if (errors.length > 0) {
      throw new EventBusAggregateError(errors);
    }
  }
}
