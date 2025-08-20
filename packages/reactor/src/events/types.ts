/**
 * Describes a function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

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
export type Subscriber = (type: number, data: any) => void | Promise<void>;

/**
 * Custom error class that aggregates multiple errors from event subscribers.
 */
export class EventBusAggregateError extends Error {
  public readonly errors: any[];

  constructor(errors: any[]) {
    const message = `EventBus emit failed with ${errors.length} error(s): ${errors
      .map((e) => {
        if (e && typeof e === "object" && "message" in e) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
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
