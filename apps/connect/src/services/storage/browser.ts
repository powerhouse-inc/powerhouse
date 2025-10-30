import type { IStorage } from "@powerhousedao/connect/services/storage/base-storage";
import { BaseStorage } from "@powerhousedao/connect/services/storage/base-storage";
import { connectConfig } from "@powerhousedao/connect/config";

const store: IStorage = {
  get: function <Key extends string>(key: Key): unknown {
    const value = localStorage.getItem(key);
    if (value) {
      return JSON.parse(value);
    }
    return undefined;
  },
  set: function <Key extends string>(key: Key, value?: unknown): void {
    return value
      ? localStorage.setItem(key, JSON.stringify(value))
      : localStorage.removeItem(key);
  },
  delete: function <Key extends string>(key: Key): void {
    return localStorage.removeItem(key);
  },
};

export class BrowserStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseStorage<T> {
  constructor(namespace: string) {
    super(store as IStorage<T>, `${connectConfig.routerBasename}:${namespace}`);
  }
}
