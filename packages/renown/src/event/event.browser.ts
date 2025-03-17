import { IEventEmitter } from "./types.js";

export class TypedCustomEvent<T> extends CustomEvent<T> {
  constructor(type: string, detail?: T) {
    super(type, { detail });
  }
}

export class BrowserEventEmitter<Events extends Record<string, unknown>>
  implements IEventEmitter<Events>
{
  #eventTarget = new EventTarget();

  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void,
  ): () => void {
    const wrappedListener = (e: Event) => {
      if (e instanceof TypedCustomEvent) {
        listener(e.detail as Events[K]);
      }
    };

    this.#eventTarget.addEventListener(event.toString(), wrappedListener);
    return () => {
      this.#eventTarget.removeEventListener(event.toString(), wrappedListener);
    };
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const customEvent = new TypedCustomEvent(event.toString(), data);
    this.#eventTarget.dispatchEvent(customEvent);
  }
}
