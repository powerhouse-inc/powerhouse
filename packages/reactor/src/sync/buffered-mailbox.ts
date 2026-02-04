import { type MailboxItem, MailboxAggregateError } from "./mailbox.js";

type MailboxCallback<T extends MailboxItem> = (item: T) => void;

export class BufferedMailbox<T extends MailboxItem> {
  private itemsMap: Map<string, T> = new Map();
  private addedCallbacks: MailboxCallback<T>[] = [];
  private removedCallbacks: MailboxCallback<T>[] = [];
  private addedBuffer: T[] = [];
  private removedBuffer: T[] = [];
  private addedTimer: ReturnType<typeof setTimeout> | null = null;
  private removedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly milliseconds: number;
  private readonly maxQueued: number;

  constructor(milliseconds: number, maxQueued: number) {
    this.milliseconds = milliseconds;
    this.maxQueued = maxQueued;
  }

  get items(): ReadonlyArray<T> {
    return Array.from(this.itemsMap.values());
  }

  get(id: string): T | undefined {
    return this.itemsMap.get(id);
  }

  add(item: T): void {
    this.itemsMap.set(item.id, item);
    this.addedBuffer.push(item);

    if (this.addedBuffer.length >= this.maxQueued) {
      this.flushAdded();
    } else {
      this.scheduleAddedFlush();
    }
  }

  remove(item: T): void {
    this.itemsMap.delete(item.id);
    this.removedBuffer.push(item);

    if (this.removedBuffer.length >= this.maxQueued) {
      this.flushRemoved();
    } else {
      this.scheduleRemovedFlush();
    }
  }

  onAdded(callback: MailboxCallback<T>): void {
    this.addedCallbacks.push(callback);
  }

  onRemoved(callback: MailboxCallback<T>): void {
    this.removedCallbacks.push(callback);
  }

  flush(): void {
    this.flushAdded();
    this.flushRemoved();
  }

  private scheduleAddedFlush(): void {
    if (this.addedTimer !== null) {
      clearTimeout(this.addedTimer);
    }
    this.addedTimer = setTimeout(() => {
      this.flushAdded();
    }, this.milliseconds);
  }

  private scheduleRemovedFlush(): void {
    if (this.removedTimer !== null) {
      clearTimeout(this.removedTimer);
    }
    this.removedTimer = setTimeout(() => {
      this.flushRemoved();
    }, this.milliseconds);
  }

  private flushAdded(): void {
    if (this.addedTimer !== null) {
      clearTimeout(this.addedTimer);
      this.addedTimer = null;
    }

    const items = this.addedBuffer;
    this.addedBuffer = [];

    if (items.length > 0) {
      this.invokeCallbacks(this.addedCallbacks, items);
    }
  }

  private flushRemoved(): void {
    if (this.removedTimer !== null) {
      clearTimeout(this.removedTimer);
      this.removedTimer = null;
    }

    const items = this.removedBuffer;
    this.removedBuffer = [];

    if (items.length > 0) {
      this.invokeCallbacks(this.removedCallbacks, items);
    }
  }

  private invokeCallbacks(callbacks: MailboxCallback<T>[], items: T[]): void {
    const callbacksCopy = [...callbacks];
    const errors: Error[] = [];

    for (const item of items) {
      for (const callback of callbacksCopy) {
        try {
          callback(item);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new MailboxAggregateError(errors);
    }
  }
}
