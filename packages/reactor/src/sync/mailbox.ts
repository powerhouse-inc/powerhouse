export type MailboxItem = {
  id: string;
};

export type MailboxCallback<T extends MailboxItem> = (items: T[]) => void;

export interface IMailbox<T extends MailboxItem> {
  readonly items: ReadonlyArray<T>;
  get(id: string): T | undefined;
  add(...items: T[]): void;
  remove(...items: T[]): void;
  onAdded(callback: MailboxCallback<T>): void;
  onRemoved(callback: MailboxCallback<T>): void;
  pause(): void;
  resume(): void;
  flush(): void;
  isPaused(): boolean;
}

export class MailboxAggregateError extends Error {
  errors: Error[];

  constructor(errors: Error[]) {
    const messages = errors.map((e) => e.message).join("; ");
    super(
      `Mailbox callback failed with ${errors.length} error(s): ${messages}`,
    );
    this.name = "MailboxAggregateError";
    this.errors = errors;
  }
}

export class Mailbox<T extends MailboxItem> implements IMailbox<T> {
  private itemsMap: Map<string, T> = new Map();
  private addedCallbacks: MailboxCallback<T>[] = [];
  private removedCallbacks: MailboxCallback<T>[] = [];
  private paused: boolean = false;
  private addedBuffer: T[] = [];
  private removedBuffer: T[] = [];

  get items(): ReadonlyArray<T> {
    return Array.from(this.itemsMap.values());
  }

  get(id: string): T | undefined {
    return this.itemsMap.get(id);
  }

  add(...items: T[]): void {
    for (const item of items) {
      this.itemsMap.set(item.id, item);
    }
    if (this.paused) {
      this.addedBuffer.push(...items);
      return;
    }
    const callbacks = [...this.addedCallbacks];
    const errors: Error[] = [];
    for (const callback of callbacks) {
      try {
        callback(items);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) {
      throw new MailboxAggregateError(errors);
    }
  }

  remove(...items: T[]): void {
    for (const item of items) {
      this.itemsMap.delete(item.id);
    }
    if (this.paused) {
      this.removedBuffer.push(...items);
      return;
    }
    const callbacks = [...this.removedCallbacks];
    const errors: Error[] = [];
    for (const callback of callbacks) {
      try {
        callback(items);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) {
      throw new MailboxAggregateError(errors);
    }
  }

  onAdded(callback: MailboxCallback<T>): void {
    this.addedCallbacks.push(callback);
  }

  onRemoved(callback: MailboxCallback<T>): void {
    this.removedCallbacks.push(callback);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.flush();
  }

  flush(): void {
    const addedItems = this.addedBuffer;
    this.addedBuffer = [];
    const errors: Error[] = [];

    if (addedItems.length > 0) {
      const callbacks = [...this.addedCallbacks];
      for (const callback of callbacks) {
        try {
          callback(addedItems);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    const removedItems = this.removedBuffer;
    this.removedBuffer = [];

    if (removedItems.length > 0) {
      const callbacks = [...this.removedCallbacks];
      for (const callback of callbacks) {
        try {
          callback(removedItems);
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

  isPaused(): boolean {
    return this.paused;
  }
}
