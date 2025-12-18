import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { ChannelError } from "../../../src/sync/errors.js";
import type { IChannel } from "../../../src/sync/interfaces.js";
import type { SyncOperation } from "../../../src/sync/sync-operation.js";
import { Mailbox } from "../../../src/sync/mailbox.js";
import type { RemoteCursor, SyncEnvelope } from "../../../src/sync/types.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { envelopeToSyncOperation } from "../../../src/sync/channels/utils.js";

/**
 * Test channel for bidirectional communication in tests.
 *
 * TestChannel enables direct bidirectional communication between two reactor
 * instances without network transport. Channels are wired together by passing
 * a send function that delivers envelopes to the peer's inbox.
 *
 * Unlike PollingChannel, TestChannel auto-sends on outbox add, making it
 * suitable for testing synchronization flows.
 */
export class TestChannel implements IChannel {
  readonly inbox: Mailbox<SyncOperation>;
  readonly outbox: Mailbox<SyncOperation>;
  readonly deadLetter: Mailbox<SyncOperation>;

  private readonly channelId: string;
  private readonly remoteName: string;
  private readonly cursorStorage: ISyncCursorStorage;
  private readonly send: (envelope: SyncEnvelope) => void;
  private isShutdown: boolean;

  constructor(
    channelId: string,
    remoteName: string,
    cursorStorage: ISyncCursorStorage,
    send: (envelope: SyncEnvelope) => void,
  ) {
    this.channelId = channelId;
    this.remoteName = remoteName;
    this.cursorStorage = cursorStorage;
    this.send = send;
    this.isShutdown = false;

    this.inbox = new Mailbox<SyncOperation>();
    this.outbox = new Mailbox<SyncOperation>();
    this.deadLetter = new Mailbox<SyncOperation>();

    this.outbox.onAdded((syncOp) => {
      this.handleOutboxAdded(syncOp);
    });
  }

  shutdown(): void {
    this.isShutdown = true;
  }

  async init(): Promise<void> {}

  receive(envelope: SyncEnvelope): void {
    if (this.isShutdown) {
      throw new Error(
        `Channel ${this.channelId} is shutdown and cannot receive envelopes`,
      );
    }

    if (envelope.type === "operations" && envelope.operations) {
      const syncOp = envelopeToSyncOperation(envelope, this.remoteName);
      syncOp.transported();
      this.inbox.add(syncOp);
    }
  }

  async updateCursor(cursorOrdinal: number): Promise<void> {
    const cursor: RemoteCursor = {
      remoteName: this.remoteName,
      cursorOrdinal,
      lastSyncedAtUtcMs: Date.now(),
    };

    await this.cursorStorage.upsert(cursor);
  }

  private handleOutboxAdded(syncOp: SyncOperation): void {
    if (this.isShutdown) {
      return;
    }

    try {
      syncOp.started();

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: this.channelId },
        operations: syncOp.operations,
      };

      this.send(envelope);

      syncOp.executed();
      this.outbox.remove(syncOp);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
      syncOp.failed(channelError);
      this.deadLetter.add(syncOp);
      this.outbox.remove(syncOp);
    }
  }
}
