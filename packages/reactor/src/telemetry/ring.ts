/** A fixed-size buffer: pushing past `capacity` drops the oldest. */
export class Ring<T> {
  private readonly items: T[] = [];
  private next = 0;

  constructor(readonly capacity: number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }
    this.items[this.next] = item;
    this.next = (this.next + 1) % this.capacity;
  }

  /** Oldest first. */
  toArray(): T[] {
    return [...this.items.slice(this.next), ...this.items.slice(0, this.next)];
  }

  last(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length < this.capacity) return this.items.at(-1);
    return this.items[(this.next + this.capacity - 1) % this.capacity];
  }

  clear(): void {
    this.items.length = 0;
    this.next = 0;
  }
}
