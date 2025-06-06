# Interface

```tsx
/**
 * Represents a function to unsubscribe from an event
 */
export type Unsubscribe = () => void;

export interface IEventBus {
  /**
   * Returns true if the event bus is drained.
   */
  isDrained(): boolean;

  /**
   * Subscribe to an event.
   * @param type - The event type to subscribe to
   * @param subscriber - The subscriber function (sync or async)
   * @returns A function to unsubscribe from the event
   */
  subscribe<K>(
    type: number,
    subscriber: (type: number, event: K) => void | Promise<void>,
  ): Unsubscribe;

  /**
  * Emit an event with data.
  * @param type - The event type to emit
  * @param data - The data to pass to subscribers
  * @param signal - Optional abort signal to cancel the event
  */
  emit(type: number, data: any, signal?: AbortSignal): Promise<void>;
}
```