# Interface

```tsx
/**
 * Represents a function to unsubscribe from an event
 */
export type Unsubscribe = () => void;

/**
 * Interface for a typed event bus where all subscribers are treated equally.
 */
export interface IEventBus {
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