import { BaseStorage } from "./common.js";

export class BrowserStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseStorage<T> {
  constructor(namespace: string, basename: string | undefined) {
    super(`${basename}:${namespace}`);
  }

  #buildKey(key: keyof T): string {
    return `${this.namespace}:${key.toString()}`;
  }
  get<Key extends keyof T>(key: Key): T[Key] | undefined {
    const value = localStorage.getItem(this.#buildKey(key));
    if (value) {
      return JSON.parse(value) as T[Key];
    }
    return undefined;
  }

  set<Key extends keyof T>(key: Key, value?: T[Key] | undefined): void {
    return value
      ? localStorage.setItem(this.#buildKey(key), JSON.stringify(value))
      : localStorage.removeItem(this.#buildKey(key));
  }

  delete(key: keyof T): void {
    return localStorage.removeItem(this.#buildKey(key));
  }
}
