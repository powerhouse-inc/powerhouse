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
  protected constructor(protected namespace: string) {}

  abstract get<Key extends keyof T>(key: Key): T[Key] | undefined;
  abstract set<Key extends keyof T>(key: Key, value?: T[Key]): void;
  abstract delete(key: keyof T): void;
}
