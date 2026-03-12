import { BaseStorage } from "./base-storage.js";

export class BrowserLocalStorage<V> extends BaseStorage<V> {
  #namespace: string;
  #storage = window.localStorage;
  constructor(namespace: string) {
    super();
    this.#namespace = namespace;
  }

  #readMap(): Map<string, V> {
    const raw = this.#storage.getItem(this.#namespace);

    if (!raw) {
      return new Map();
    }

    return new Map(JSON.parse(raw) as [string, V][]);
  }

  #writeMap(map: Map<string, V>): void {
    this.#storage.setItem(
      this.#namespace,
      JSON.stringify(Array.from(map.entries())),
    );
  }

  get(key: string): V | undefined {
    return this.#readMap().get(key);
  }

  set(key: string, value: V): void {
    const map = this.#readMap();
    map.set(key, value);
    this.#writeMap(map);
  }

  delete(key: string): boolean {
    const map = this.#readMap();
    const deleted = map.delete(key);
    if (deleted) {
      this.#writeMap(map);
    }
    return deleted;
  }

  has(key: string): boolean {
    return this.#readMap().has(key);
  }

  clear(): void {
    this.#storage.removeItem(this.#namespace);
  }

  entries(): IterableIterator<[string, V]> {
    return this.#readMap().entries();
  }

  keys(): IterableIterator<string> {
    return this.#readMap().keys();
  }

  values(): IterableIterator<V> {
    return this.#readMap().values();
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.#readMap().entries();
  }
}
