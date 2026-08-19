import type { ILogger } from "document-model";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { ConnectionStateChangeCallback, IChannel } from "../interfaces.js";
import { Mailbox } from "../mailbox.js";
import type { SyncOperation } from "../sync-operation.js";
import type { ConnectionState, ConnectionStateSnapshot } from "../types.js";
import { SyncOperationStatus } from "../types.js";
import { getLatestAppliedOrdinal } from "./utils.js";

/** Where a sync operation's run of ordinals begins. */
function firstOrdinalOf(syncOp: SyncOperation): number {
  return syncOp.operations.length > 0
    ? syncOp.operations[0].context.ordinal
    : 0;
}

/**
 * This class is used server-side to accumulate inbox + outbox operations.
 *
 * In general, the resolvers are responsible for updating mailboxes.
 */
export class GqlResponseChannel implements IChannel {
  readonly inbox: Mailbox;
  readonly outbox: Mailbox;
  readonly deadLetter: Mailbox;

  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private isShutdown: boolean;
  private lastPersistedInboxOrdinal: number = 0;
  private lastPersistedOutboxOrdinal: number = 0;
  private evictedOutboxFloor: number = Number.POSITIVE_INFINITY;
  private appliedOutboxOrdinal: number = 0;
  private connectionState: ConnectionState = "connecting";
  private readonly connectionStateCallbacks: Set<ConnectionStateChangeCallback> =
    new Set();

  constructor(
    private readonly logger: ILogger,
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
  ) {
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.isShutdown = false;

    this.inbox = new Mailbox();
    this.outbox = new Mailbox();
    this.deadLetter = new Mailbox();

    // Instead of listening to syncops directly for cursor updates, we listen
    // to the mailbox. This is for efficiency: many syncops may fire on a trim,
    // but only one onRemoved callback will be fired for the batch.
    this.outbox.onRemoved((syncOps) => {
      this.rememberUnserved(syncOps);
      this.persistOutboxCursor(getLatestAppliedOrdinal(syncOps));
    });

    // An entry arriving at or below the evicted floor is the re-derivation of
    // what was evicted: it is queued again, so the queue itself now holds the
    // floor down and the remembered one would only pin the cursor for good.
    this.outbox.onAdded((syncOps) => {
      this.forgetEvictedBelow(syncOps);
    });

    this.inbox.onRemoved((syncOps) => {
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.lastPersistedInboxOrdinal) {
        this.lastPersistedInboxOrdinal = maxOrdinal;
        this.cursorStorage
          .upsert({
            remoteName: this.remoteName,
            cursorType: "inbox",
            cursorOrdinal: maxOrdinal,
            lastSyncedAtUtcMs: Date.now(),
          })
          .catch((error) => {
            this.logger.error(
              "Failed to update inbox cursor for @ChannelId! This is unlikely to cause a problem, but not-optimal: @Error",
              this.channelId,
              error,
            );
          });
      }
    });
  }

  shutdown(): Promise<void> {
    this.isShutdown = true;
    this.transitionConnectionState("disconnected");
    return Promise.resolve();
  }

  getConnectionState(): ConnectionStateSnapshot {
    return {
      state: this.connectionState,
      failureCount: 0,
      lastSuccessUtcMs: 0,
      lastFailureUtcMs: 0,
      pushBlocked: false,
      pushFailureCount: 0,
      receivingPages: false,
      requiresAuth: false,
    };
  }

  onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => {
      this.connectionStateCallbacks.delete(callback);
    };
  }

  /** Response channels are push-driven; resolvers populate mailboxes directly. */
  triggerPull(): void {}

  async init(): Promise<void> {
    // get cursors -- these are the last acknowledged ordinals for the inbox and outbox
    const cursors = await this.cursorStorage.list(this.remoteName);
    const inboxOrdinal =
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0;
    const outboxOrdinal =
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0;
    this.inbox.init(inboxOrdinal);
    this.outbox.init(outboxOrdinal);
    this.lastPersistedInboxOrdinal = inboxOrdinal;
    this.lastPersistedOutboxOrdinal = outboxOrdinal;
    this.appliedOutboxOrdinal = outboxOrdinal;
    this.transitionConnectionState("connected");
  }

  private transitionConnectionState(next: ConnectionState): void {
    if (this.connectionState === next) return;
    this.connectionState = next;
    const snapshot = this.getConnectionState();
    for (const callback of this.connectionStateCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(
          "Connection state change callback error: @Error",
          error,
        );
      }
    }
  }

  /**
   * Records the ordinals of entries that left the outbox without being served,
   * so the cursor cannot advance past them.
   *
   * An entry can leave unserved because a bound evicted it, and an evicted entry
   * is exactly one this channel intends to re-derive: it is still owed to the
   * remote. Remembering the floor across the whole run rather than only while
   * the entry is present is what makes that true after a later ack would
   * otherwise have swept the cursor past it.
   */
  private rememberUnserved(syncOps: SyncOperation[]): void {
    for (const syncOp of syncOps) {
      if (syncOp.status === SyncOperationStatus.Applied) continue;
      const first = firstOrdinalOf(syncOp);
      if (first > 0 && first < this.evictedOutboxFloor) {
        this.evictedOutboxFloor = first;
      }
    }
  }

  /**
   * Persists the outbox cursor, never past an operation this remote has not
   * been served.
   *
   * The cursor is where a restart resumes deriving the outbox from, so an
   * ordinal persisted past an unserved entry loses that entry for good: the
   * rebuild starts beyond it and nothing else remembers it was owed. Acks
   * arrive out of order with respect to what is withheld -- a later entry can
   * be acknowledged while an earlier one is still being withheld from this
   * subject -- so the applied high-water mark alone is not a safe cursor.
   */
  private persistOutboxCursor(appliedOrdinal: number): void {
    this.appliedOutboxOrdinal = Math.max(
      this.appliedOutboxOrdinal,
      appliedOrdinal,
    );
    const ordinal = Math.min(
      this.appliedOutboxOrdinal,
      this.unservedFloor() - 1,
    );
    if (ordinal <= this.lastPersistedOutboxOrdinal) {
      return;
    }

    this.lastPersistedOutboxOrdinal = ordinal;
    this.cursorStorage
      .upsert({
        remoteName: this.remoteName,
        cursorType: "outbox",
        cursorOrdinal: ordinal,
        lastSyncedAtUtcMs: Date.now(),
      })
      .catch((error) => {
        this.logger.error(
          "Failed to update outbox cursor for @ChannelId! This means that future application runs may resend duplicate operations. This is recoverable (with deduplication protection), but not-optimal: @Error",
          this.channelId,
          error,
        );
      });
  }

  /** Drops the evicted floor once the entries it stood for are queued again. */
  private forgetEvictedBelow(syncOps: SyncOperation[]): void {
    if (this.evictedOutboxFloor === Number.POSITIVE_INFINITY) {
      return;
    }

    for (const syncOp of syncOps) {
      const first = firstOrdinalOf(syncOp);
      if (first > 0 && first <= this.evictedOutboxFloor) {
        this.evictedOutboxFloor = Number.POSITIVE_INFINITY;
        return;
      }
    }
  }

  /** The lowest ordinal still owed to this remote, evicted or still queued. */
  private unservedFloor(): number {
    let floor = this.evictedOutboxFloor;
    for (const syncOp of this.outbox.items) {
      if (syncOp.status === SyncOperationStatus.Applied) continue;
      const first = firstOrdinalOf(syncOp);
      if (first > 0 && first < floor) {
        floor = first;
      }
    }
    return floor;
  }
}
