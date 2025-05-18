import { EventEmitter } from "node:events";
import type { IEventEmitter } from "./types.js";

export class NodeEventEmitter<Events extends Record<string, unknown>>
  implements IEventEmitter<Events>
{
  #emitter = new EventEmitter();

  constructor() {
    this.#emitter.setMaxListeners(0);
  }

  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void,
  ): () => void {
    this.#emitter.on(event as string, listener);
    return () => {
      this.#emitter.removeListener(event.toString(), listener);
    };
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.#emitter.emit(event.toString(), data);
  }
}
