import { isPurgeMarker } from "@powerhousedao/shared/document-model";
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
   * Never at or past an item that is neither applied nor failed, unless the
   * mailbox opted out, and with holdAckBelowMarkers never at or past an
   * unapplied marker entry either.
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
  advanceOrdinal(ordinal: number): void;
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

export type MailboxOptions = {
  /** An unapplied item carrying a purge marker keeps ackOrdinal below it. */
  holdAckBelowMarkers?: boolean;
  /**
   * An item neither applied nor failed keeps ackOrdinal below it. Defaults to
   * true: items for different documents apply out of order, so the maximum
   * applied ordinal can pass one still loading. A failed item does not hold it;
   * its dead letter stands for it. Opt out only where no cursor reads the ack.
   */
  holdAckBelowUnapplied?: boolean;
};

export class Mailbox implements IMailbox {
  private readonly holdAckBelowMarkers: boolean;
  private readonly holdAckBelowUnapplied: boolean;
  private itemsMap: Map<string, SyncOperation> = new Map();
  /** Unapplied items carrying a marker, so the held ack reads only these. */
  private readonly heldMarkers = new Set<SyncOperation>();
  /** Lowest ordinal of each item neither applied nor failed, read once at add. */
  private readonly unapplied = new Map<SyncOperation, number>();
  /** Null when stale; a valid cache may be positive infinity. */
  private unappliedFloorCache: number | null = Number.POSITIVE_INFINITY;
  private addedCallbacks: MailboxCallback[] = [];
  private removedCallbacks: MailboxCallback[] = [];
  private paused: boolean = false;
  private addedBuffer: SyncOperation[] = [];
  private removedBuffer: SyncOperation[] = [];

  private _ack: number = 0;
  private _latestOrdinal: number = 0;

  constructor(options: MailboxOptions = {}) {
    this.holdAckBelowMarkers = options.holdAckBelowMarkers ?? false;
    this.holdAckBelowUnapplied = options.holdAckBelowUnapplied ?? true;
  }

  init(ackOrdinal: number) {
    this._ack = this._latestOrdinal = ackOrdinal;
  }

  advanceOrdinal(ordinal: number): void {
    this._latestOrdinal = Math.max(this._latestOrdinal, ordinal);
  }

  get items(): ReadonlyArray<SyncOperation> {
    return Array.from(this.itemsMap.values());
  }

  get ackOrdinal(): number {
    let floor = this.unappliedFloor();
    for (const item of this.heldMarkers) {
      for (const op of item.operations) {
        const ordinal = op.context.ordinal;
        if (ordinal > 0 && ordinal < floor) floor = ordinal;
      }
    }
    if (floor === Number.POSITIVE_INFINITY) return this._ack;
    return Math.min(this._ack, floor - 1);
  }

  get latestOrdinal(): number {
    return this._latestOrdinal;
  }

  get(id: string): SyncOperation | undefined {
    return this.itemsMap.get(id);
  }

  add(...items: SyncOperation[]): void {
    for (const item of items) {
      const replaced = this.itemsMap.get(item.id);
      if (replaced !== undefined && replaced !== item) {
        this.heldMarkers.delete(replaced);
        this.forgetUnapplied(replaced);
      }
      this.itemsMap.set(item.id, item);

      let marker = false;
      let lowest = Number.POSITIVE_INFINITY;
      for (const op of item.operations) {
        const ordinal = op.context.ordinal;
        this._latestOrdinal = Math.max(this._latestOrdinal, ordinal);
        if (ordinal > 0 && ordinal < lowest) lowest = ordinal;
        if (isPurgeMarker(op)) marker = true;
      }
      if (
        this.holdAckBelowUnapplied &&
        lowest !== Number.POSITIVE_INFINITY &&
        item.status !== SyncOperationStatus.Applied &&
        item.status !== SyncOperationStatus.Error
      ) {
        this.unapplied.set(item, lowest);
        const cached = this.unappliedFloorCache;
        if (cached !== null && lowest < cached) {
          this.unappliedFloorCache = lowest;
        }
      }
      if (
        this.holdAckBelowMarkers &&
        marker &&
        item.status !== SyncOperationStatus.Applied
      ) {
        this.heldMarkers.add(item);
      }

      // listen for updates to the syncop status
      item.on((syncOp, _, next) => {
        if (next === SyncOperationStatus.Error) this.forgetUnapplied(syncOp);
        if (next === SyncOperationStatus.Applied) {
          this.heldMarkers.delete(syncOp);
          this.forgetUnapplied(syncOp);
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
      const current = this.itemsMap.get(item.id);
      if (current !== undefined && current !== item) {
        this.heldMarkers.delete(current);
        this.forgetUnapplied(current);
      }
      this.itemsMap.delete(item.id);
      this.heldMarkers.delete(item);
      this.forgetUnapplied(item);
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

  /** Recomputed only once the item that set it has resolved. */
  private unappliedFloor(): number {
    if (this.unappliedFloorCache !== null) return this.unappliedFloorCache;
    let floor = Number.POSITIVE_INFINITY;
    for (const ordinal of this.unapplied.values()) {
      if (ordinal < floor) floor = ordinal;
    }
    this.unappliedFloorCache = floor;
    return floor;
  }

  private forgetUnapplied(item: SyncOperation): void {
    const ordinal = this.unapplied.get(item);
    if (ordinal === undefined) return;
    this.unapplied.delete(item);
    if (ordinal === this.unappliedFloorCache) this.unappliedFloorCache = null;
  }
}
