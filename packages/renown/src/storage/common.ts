export interface IStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
  Key extends keyof T = keyof T,
> {
  get(key: Key): T[Key] | undefined;
  set(key: Key, value?: T[Key]): void;
  delete(key: Key): void;
}

export abstract class BaseStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
  Key extends keyof T = keyof T,
> implements IStorage<T>
{
  abstract get(key: Key): T[Key] | undefined;
  abstract set(key: Key, value?: T[Key]): void;
  abstract delete(key: Key): void;
}

export class MemoryStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
  Key extends keyof T = keyof T,
> extends BaseStorage<T> {
  private readonly data = new Map<Key, T[Key]>();

  get(key: Key) {
    return this.data.get(key);
  }

  set(key: Key, value?: T[Key]): void {
    if (value === undefined) {
      this.data.delete(key);
    } else {
      this.data.set(key, value);
    }
  }

  delete(key: Key): void {
    this.data.delete(key);
  }
}
