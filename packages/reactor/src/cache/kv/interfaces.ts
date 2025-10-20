/**
 * IKeyValueStore provides a simple key-value storage abstraction for persisting
 * keyframe snapshots.
 *
 * All values are stored as strings. Implementations are responsible for serialization
 * and deserialization of complex data structures.
 */
export interface IKeyValueStore {
  /**
   * Retrieves a value from the store.
   *
   * @param key - The key to retrieve
   * @param signal - Optional abort signal to cancel the operation
   * @returns The value associated with the key, or undefined if not found
   */
  get(key: string, signal?: AbortSignal): Promise<string | undefined>;

  /**
   * Stores a value in the store.
   *
   * @param key - The key to store under
   * @param value - The value to store (must be a string)
   * @param signal - Optional abort signal to cancel the operation
   */
  put(key: string, value: string, signal?: AbortSignal): Promise<void>;

  /**
   * Deletes a value from the store.
   *
   * @param key - The key to delete
   * @param signal - Optional abort signal to cancel the operation
   */
  delete(key: string, signal?: AbortSignal): Promise<void>;

  /**
   * Clears all values from the store.
   */
  clear(): Promise<void>;

  /**
   * Performs startup initialization.
   * Called once when the store is initialized.
   */
  startup(): Promise<void>;

  /**
   * Performs graceful shutdown.
   * Called once when the store is being shut down.
   */
  shutdown(): Promise<void>;
}
