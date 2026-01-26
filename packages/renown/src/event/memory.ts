import type { RenownEvents } from "../types.js";
import type { IEventEmitter } from "./types.js";

export class MemoryEventEmitter implements IEventEmitter<RenownEvents> {
  #listeners = new Map<keyof RenownEvents, Set<(data: unknown) => void>>();

  on<K extends keyof RenownEvents>(
    event: K,
    listener: (data: RenownEvents[K]) => void,
  ): () => void {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event)!.add(listener as (data: unknown) => void);
    return () => {
      this.#listeners.get(event)?.delete(listener as (data: unknown) => void);
    };
  }

  emit<K extends keyof RenownEvents>(event: K, data: RenownEvents[K]): void {
    this.#listeners.get(event)?.forEach((listener) => listener(data));
  }
}
