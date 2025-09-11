import type { Unsubscribe } from "./types.js";

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
