import {
  type IMailbox,
  MailboxAggregateError,
  type MailboxCallback,
} from "./mailbox.js";
import type { SyncOperation } from "./sync-operation.js";
import { SyncOperationStatus } from "./types.js";

export class BufferedMailbox implements IMailbox {
  private itemsMap: Map<string, SyncOperation> = new Map();
  private addedCallbacks: MailboxCallback[] = [];
  private removedCallbacks: MailboxCallback[] = [];
  private addedBuffer: SyncOperation[] = [];
  private removedBuffer: SyncOperation[] = [];
  private addedTimer: ReturnType<typeof setTimeout> | null = null;
  private removedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly milliseconds: number;
  private readonly maxQueued: number;
  private paused: boolean = false;

  private _ack: number = 0;
  private _latestOrdinal: number = 0;

  constructor(milliseconds: number, maxQueued: number) {
    this.milliseconds = milliseconds;
    this.maxQueued = maxQueued;
  }

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
    this.addedBuffer.push(...items);

    if (this.paused) {
      return;
    }

    if (this.addedBuffer.length >= this.maxQueued) {
      this.flushAdded();
    } else {
      this.scheduleAddedFlush();
    }
  }

  remove(...items: SyncOperation[]): void {
    for (const item of items) {
      this.itemsMap.delete(item.id);
    }
    this.removedBuffer.push(...items);

    if (this.paused) {
      return;
    }

    if (this.removedBuffer.length >= this.maxQueued) {
      this.flushRemoved();
    } else {
      this.scheduleRemovedFlush();
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
    if (this.addedTimer !== null) {
      clearTimeout(this.addedTimer);
      this.addedTimer = null;
    }
    if (this.removedTimer !== null) {
      clearTimeout(this.removedTimer);
      this.removedTimer = null;
    }
  }

  resume(): void {
    this.paused = false;
    if (this.addedBuffer.length > 0) {
      this.scheduleAddedFlush();
    }
    if (this.removedBuffer.length > 0) {
      this.scheduleRemovedFlush();
    }
  }

  isPaused(): boolean {
    return this.paused;
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

  private invokeCallbacks(
    callbacks: MailboxCallback[],
    items: SyncOperation[],
  ): void {
    const callbacksCopy = [...callbacks];
    const errors: Error[] = [];

    for (const callback of callbacksCopy) {
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
}
