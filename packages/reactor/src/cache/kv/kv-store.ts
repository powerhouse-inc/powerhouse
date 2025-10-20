import type { IKeyValueStore } from "./interfaces.js";

/**
 * InMemoryKeyValueStore is a simple Map-based implementation of IKeyValueStore.
 * This implementation is ideal for:
 * - Testing and development environments
 * - Single-process applications
 * - Scenarios where persistence is not required
 *
 * Data is stored in-memory and will be lost when the process terminates.
 */
export class InMemoryKeyValueStore implements IKeyValueStore {
  private store: Map<string, string> = new Map<string, string>();

  get(key: string, signal?: AbortSignal): Promise<string | undefined> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }
    return Promise.resolve(this.store.get(key));
  }

  put(key: string, value: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }
    this.store.set(key, value);

    return Promise.resolve();
  }

  delete(key: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Operation aborted"));
    }
    this.store.delete(key);

    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  startup(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}
