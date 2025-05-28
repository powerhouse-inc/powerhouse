/**
 * Describes a function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

/**
 * Custom error class that aggregates multiple errors from event subscribers.
 */
export class EventBusAggregateError extends Error {
  public readonly errors: any[];

  constructor(errors: any[]) {
    const message = `EventBus emit failed with ${errors.length} error(s): ${errors
      .map((e) => {
        if (e && typeof e === "object" && "message" in e) {
          return e.message;
        }
        return String(e);
      })
      .join("; ")}`;
    super(message);

    this.name = "EventBusAggregateError";
    this.errors = errors;
  }
}

/**
 * Describes an object that manages event subscriptions and emissions.
 */
export interface IEventBus {
  /**
   * Register a new subscriber.
   * Order is preserved by pushing to the end of the per-type array.
   *
   * @param type - The type of event to subscribe to.
   * @param subscriber - The subscriber function to call when the event is emitted.
   *
   * @returns A function to unsubscribe from the event.
   */
  subscribe<K>(
    type: number,
    subscriber: (type: number, event: K) => void | Promise<void>,
  ): Unsubscribe;

  /**
   * Emits an event and waits until **all** subscribers finish.
   *  - Every subscriber present at emit-start is called, in registration order.
   *  - Calls are invoked and settled sequentially.
   *  - If subscribers throw/reject, `emit` rejects with an aggregate error of all errors.
   *
   * @param type - The type of event to emit.
   * @param data - The data to pass to the subscribers.
   */
  emit(type: number, data: any): Promise<void>;
}

/**
 * A subscriber is a function that is called when an event is emitted.
 *
 * It is passed the event type and the data.
 * It can return a promise or a value.
 * If it returns a promise, the event bus will wait for the promise to resolve before calling the next subscriber.
 * If it throws an error, the event bus will reject with an aggregate error of all errors.
 *
 * @param type - The type of event to emit.
 * @param data - The data to pass to the subscriber.
 */
type Subscriber = (type: number, data: any) => void | Promise<void>;

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
