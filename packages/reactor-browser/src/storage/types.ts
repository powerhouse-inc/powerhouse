export interface IStorage<TValue> {
  get(key: string): TValue | undefined;
  set(key: string, value: TValue): void;
  delete(key: string): void;
}
