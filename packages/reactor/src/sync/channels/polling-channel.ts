import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { PollingChannelError } from "../errors.js";
import type { IChannel } from "../interfaces.js";
import type { SyncOperation } from "../sync-operation.js";
import { Mailbox } from "../mailbox.js";
import type { RemoteCursor, SyncEnvelope } from "../types.js";
import { envelopesToSyncOperations } from "./utils.js";

/**
 * Channel for cursor-based polling by external clients.
 *
 * PollingChannel does NOT auto-remove operations from the outbox.
 * Operations remain until explicitly acknowledged via cursor
 * advancement through updateCursor().
 */
export class PollingChannel implements IChannel {
  readonly inbox: Mailbox<SyncOperation>;
  readonly outbox: Mailbox<SyncOperation>;
  readonly deadLetter: Mailbox<SyncOperation>;

  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private isShutdown: boolean;

  constructor(
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
  ) {
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.isShutdown = false;

    this.inbox = new Mailbox<SyncOperation>();
    this.outbox = new Mailbox<SyncOperation>();
    this.deadLetter = new Mailbox<SyncOperation>();
  }

  shutdown(): void {
    this.isShutdown = true;
  }

  async init(): Promise<void> {}

  /**
   * Receives a sync envelope from a peer channel.
   *
   * @param envelope - The sync envelope to receive
   * @throws {PollingChannelError} If channel is shutdown
   */
  receive(envelope: SyncEnvelope): void {
    if (this.isShutdown) {
      throw new PollingChannelError(
        `Channel ${this.channelId} is shutdown and cannot receive envelopes`,
      );
    }

    if (envelope.type === "operations" && envelope.operations) {
      const syncOps = envelopesToSyncOperations(envelope, this.remoteName);
      for (const syncOp of syncOps) {
        syncOp.transported();
      }
      this.inbox.add(...syncOps);
    }
  }

  /**
   * Advances the cursor and removes acknowledged operations from outbox.
   * Operations with ordinal <= cursorOrdinal are considered acknowledged.
   *
   * @param cursorOrdinal - The last processed ordinal (exclusive)
   */
  async updateCursor(cursorOrdinal: number): Promise<void> {
    const cursor: RemoteCursor = {
      remoteName: this.remoteName,
      cursorType: "inbox",
      cursorOrdinal,
      lastSyncedAtUtcMs: Date.now(),
    };

    await this.cursorStorage.upsert(cursor);

    const toRemove: SyncOperation[] = [];
    for (const op of this.outbox.items) {
      const maxOrdinal = Math.max(
        ...op.operations.map((o) => o.context.ordinal),
      );
      if (maxOrdinal <= cursorOrdinal) {
        op.executed();
        toRemove.push(op);
      }
    }
    if (toRemove.length > 0) {
      this.outbox.remove(...toRemove);
    }
  }
}
