/**
 * RingBuffer is a generic circular buffer implementation that stores a fixed number
 * of items. When the buffer is full, new items overwrite the oldest items.
 *
 * This implementation maintains O(1) time complexity for push operations and provides
 * items in chronological order (oldest to newest) via getAll().
 *
 * @template T - The type of items stored in the buffer
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private size: number = 0;
  private capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("Ring buffer capacity must be greater than 0");
    }
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
  }

  /**
   * Adds an item to the buffer. If the buffer is full, overwrites the oldest item.
   *
   * @param item - The item to add
   */
  push(item: T): void {
    const index = (this.head + this.size) % this.capacity;

    if (this.size < this.capacity) {
      this.buffer[index] = item;
      this.size++;
    } else {
      this.buffer[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Returns all items in the buffer in chronological order (oldest to newest).
   *
   * @returns Array of items in insertion order
   */
  getAll(): T[] {
    if (this.size === 0) {
      return [];
    }

    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity;
      result.push(this.buffer[index]);
    }
    return result;
  }

  /**
   * Clears all items from the buffer.
   */
  clear(): void {
    this.buffer = new Array<T>(this.capacity);
    this.head = 0;
    this.size = 0;
  }

  /**
   * Returns the newest (most recently pushed) item without allocating an array.
   * O(1) time complexity.
   */
  peekNewest(): T | undefined {
    if (this.size === 0) return undefined;
    const index = (this.head + this.size - 1) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Gets the current number of items in the buffer.
   */
  get length(): number {
    return this.size;
  }
}
