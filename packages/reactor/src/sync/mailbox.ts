import type { SyncOperation } from "./sync-operation.js";
import { SyncOperationStatus } from "./types.js";

export type MailboxCallback = (items: SyncOperation[]) => void;

/**
 * The Mailbox interface is not intended to use any persistence. Instead, the
 * IChannel implementation is responsible for persisting cursors or other data.
 *
 * This means that ackOrdinal and latestOrdinal are in memory only.
 */
export interface IMailbox {
  get items(): ReadonlyArray<SyncOperation>;

  /**
   * The latest ordinal that has been acknowledged. Because acknowledged items
   * are removed from the mailbox, this is the last ordinal that has been removed.
   */
  get ackOrdinal(): number;

  /**
   * The latest ordinal of the items that are or have been added to the mailbox.
   * This may be greater than the ack ordinal if items have been added but not
   * yet acknowledged.
   */
  get latestOrdinal(): number;

  // sync op management
  init(ackOrdinal: number): void;
  get(id: string): SyncOperation | undefined;
  add(...items: SyncOperation[]): void;
  remove(...items: SyncOperation[]): void;

  // listeners
  onAdded(callback: MailboxCallback): void;
  onRemoved(callback: MailboxCallback): void;

  // these are mostly for debug use
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

export class Mailbox implements IMailbox {
  private itemsMap: Map<string, SyncOperation> = new Map();
  private addedCallbacks: MailboxCallback[] = [];
  private removedCallbacks: MailboxCallback[] = [];
  private paused: boolean = false;
  private addedBuffer: SyncOperation[] = [];
  private removedBuffer: SyncOperation[] = [];

  private _ack: number = 0;
  private _latestOrdinal: number = 0;

  init(ackOrdinal: number) {
    this._ack = this._latestOrdinal = ackOrdinal;
  }

  get items(): ReadonlyArray<SyncOperation> {
    return Array.from(this.itemsMap.values());
  }

  get ackOrdinal(): number {
    return this._ack;
  }

  get latestOrdinal(): number {
    return this._latestOrdinal;
  }

  get(id: string): SyncOperation | undefined {
    return this.itemsMap.get(id);
  }

  add(...items: SyncOperation[]): void {
    for (const item of items) {
      this.itemsMap.set(item.id, item);

      // update latest ordinal
      for (const op of item.operations) {
        this._latestOrdinal = Math.max(this._latestOrdinal, op.context.ordinal);
      }

      // listen for updates to the syncop status
      item.on((syncOp, _, next) => {
        if (next === SyncOperationStatus.Applied) {
          for (const op of syncOp.operations) {
            this._ack = Math.max(this._ack, op.context.ordinal);
          }
        }
      });
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

  remove(...items: SyncOperation[]): void {
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

  onAdded(callback: MailboxCallback): void {
    this.addedCallbacks.push(callback);
  }

  onRemoved(callback: MailboxCallback): void {
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
    if (this.addedBuffer.length > 0) {
      const items = this.addedBuffer.splice(0);
      const callbacks = [...this.addedCallbacks];
      const errors: Error[] = [];
      for (const callback of callbacks) {
        try {
          callback(items);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      if (errors.length > 0) {
        throw new MailboxAggregateError(errors);
      }
    }

    if (this.removedBuffer.length > 0) {
      const items = this.removedBuffer.splice(0);
      const callbacks = [...this.removedCallbacks];
      const errors: Error[] = [];
      for (const callback of callbacks) {
        try {
          callback(items);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      if (errors.length > 0) {
        throw new MailboxAggregateError(errors);
      }
    }
  }

  isPaused(): boolean {
    return this.paused;
  }
}
