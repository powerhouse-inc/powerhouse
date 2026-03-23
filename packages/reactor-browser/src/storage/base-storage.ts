export abstract class BaseStorage<V> implements Iterable<[string, V]> {
  abstract get(key: string): V | undefined;
  abstract set(key: string, value: V): void;
  abstract delete(key: string): boolean;
  abstract has(key: string): boolean;
  abstract clear(): void;
  abstract entries(): IterableIterator<[string, V]>;
  abstract keys(): IterableIterator<string>;
  abstract values(): IterableIterator<V>;

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.entries();
  }

  forEach(
    callback: (value: V, key: string, storage: BaseStorage<V>) => void,
  ): void {
    for (const [key, value] of this) {
      callback(value, key, this);
    }
  }
}
