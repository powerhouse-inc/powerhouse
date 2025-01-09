export interface IEventEmitter<Events extends Record<string, unknown>> {
  /**
   * Registers a listener for the specified event.
   * @param event - The event name.
   * @param listener - The listener function for the event.
   * @returns A function to remove the listener.
   */
  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void,
  ): () => void;

  /**
   * Emits an event with the specified data.
   * @param event - The event name.
   * @param data - The data to pass to listeners.
   */
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
}
