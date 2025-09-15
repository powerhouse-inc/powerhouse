import type { IStorage } from "@powerhousedao/connect";

export class BaseStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> implements IStorage<T>
{
  #store: IStorage<T>;
  #namespace: string;

  protected constructor(store: IStorage<T>, namespace: string) {
    this.#store = store;
    this.#namespace = namespace;
  }

  #buildKey<Key extends keyof T>(key: Key): Key {
    return `${this.#namespace}:${key.toString()}` as Key;
  }

  get<Key extends keyof T>(key: Key): T[Key] {
    return this.#store.get(this.#buildKey(key));
  }
  set<Key extends keyof T>(key: Key, value?: T[Key]): void {
    return this.#store.set(this.#buildKey(key), value);
  }
  delete<Key extends keyof T>(key: Key): void {
    return this.#store.delete(this.#buildKey(key));
  }
}
