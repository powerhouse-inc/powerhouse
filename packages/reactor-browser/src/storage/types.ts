export interface IStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  get<Key extends keyof T>(key: Key): T[Key];
  set<Key extends keyof T>(key: Key, value?: T[Key]): void;
  delete<Key extends keyof T>(key: Key): void;
}
