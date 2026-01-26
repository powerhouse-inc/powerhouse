export interface IStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  get<Key extends keyof T>(key: Key): T[Key] | undefined;
  set<Key extends keyof T>(key: Key, value?: T[Key]): void;
  delete(key: keyof T): void;
}

export abstract class BaseStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> implements IStorage<T>
{
  abstract get<Key extends keyof T>(key: Key): T[Key] | undefined;
  abstract set<Key extends keyof T>(key: Key, value?: T[Key]): void;
  abstract delete(key: keyof T): void;
}

export class MemoryStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseStorage<T> {
  private readonly data = new Map();

  get<Key extends keyof T>(key: Key): T[Key] | undefined {
    return this.data.get(key);
  }

  set<Key extends keyof T>(key: Key, value?: T[Key]): void {
    if (value === undefined) {
      this.data.delete(key);
    } else {
      this.data.set(key, value);
    }
  }

  delete(key: keyof T): void {
    this.data.delete(key);
  }
}
