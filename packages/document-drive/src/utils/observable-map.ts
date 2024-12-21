import { createEventEmitter, Unsubscribe } from "./event-emitter";

export type Subscribe<K, V> = <E extends keyof ObservableMapEvents<K, V>>(
  event: E,
  callback: ObservableMapEvents<K, V>[E],
) => Unsubscribe;

export type ObservableMapEvents<K, V> = {
  add: (key: K, value: V) => void;
  update: (key: K, value: V) => void;
  remove: (key: K, value: V) => void;
};

export class ObservableMap<K, V> extends Map<K, V> {
  private emitter = createEventEmitter<ObservableMapEvents<K, V>>();

  /**
   * Override `set` to emit `add` or `update` events.
   */
  set(key: K, value: V): this {
    const isUpdate = this.has(key);
    super.set(key, value);
    if (isUpdate) {
      this.emitter.emit("update", key, value);
    } else {
      this.emitter.emit("add", key, value);
    }
    return this;
  }

  /**
   * Override `delete` to emit `remove` events.
   */
  delete(key: K): boolean {
    const listener = this.get(key);
    if (!listener) {
      return false;
    }
    const deleted = super.delete(key);
    if (deleted) {
      this.emitter.emit("remove", key, listener);
    }
    return deleted;
  }

  /**
   * Subscribe to changes in the map.
   * @param event The event to listen for (`add`, `update`, `remove`).
   * @param callback The callback to invoke when the event occurs.
   * @returns A function to unsubscribe.
   */
  on<E extends keyof ObservableMapEvents<K, V>>(
    event: E,
    callback: ObservableMapEvents<K, V>[E],
  ) {
    return this.emitter.on(event, callback);
  }
}
