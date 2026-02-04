export type MailboxItem = {
  id: string;
};

export type MailboxCallback<T extends MailboxItem> = (item: T) => void;

export interface IMailbox<T extends MailboxItem> {
  readonly items: ReadonlyArray<T>;
  get(id: string): T | undefined;
  add(item: T): void;
  remove(item: T): void;
  onAdded(callback: MailboxCallback<T>): void;
  onRemoved(callback: MailboxCallback<T>): void;
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

  get items(): ReadonlyArray<T> {
    return Array.from(this.itemsMap.values());
  }

  get(id: string): T | undefined {
    return this.itemsMap.get(id);
  }

  add(item: T): void {
    this.itemsMap.set(item.id, item);
    const callbacks = [...this.addedCallbacks];
    const errors: Error[] = [];
    for (const callback of callbacks) {
      try {
        callback(item);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) {
      throw new MailboxAggregateError(errors);
    }
  }

  remove(item: T): void {
    this.itemsMap.delete(item.id);
    const callbacks = [...this.removedCallbacks];
    const errors: Error[] = [];
    for (const callback of callbacks) {
      try {
        callback(item);
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
}
