import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import { ChannelError, InternalChannelError } from "../errors.js";
import type { IChannel } from "../interfaces.js";
import type { JobHandle } from "../job-handle.js";
import { Mailbox } from "../mailbox.js";
import type { RemoteCursor, SyncEnvelope } from "../types.js";
import { ChannelErrorSource } from "../types.js";
import { envelopeToJobHandle } from "./utils.js";

/**
 * In-memory synchronization channel for testing purposes only.
 *
 * InternalChannel enables direct bidirectional communication between two reactor
 * instances without network transport. Channels are wired together by passing
 * a send function that delivers envelopes to the peer's inbox.
 */
export class InternalChannel implements IChannel {
  readonly inbox: Mailbox<JobHandle>;
  readonly outbox: Mailbox<JobHandle>;
  readonly deadLetter: Mailbox<JobHandle>;

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

    this.inbox = new Mailbox<JobHandle>();
    this.outbox = new Mailbox<JobHandle>();
    this.deadLetter = new Mailbox<JobHandle>();

    this.outbox.onAdded((job) => {
      this.handleOutboxAdded(job);
    });
  }

  /**
   * Shuts down the channel and prevents further operations.
   */
  shutdown(): void {
    this.isShutdown = true;
  }

  /**
   * Receives a sync envelope from a peer channel.
   *
   * This method is called by the peer's send function to deliver an envelope
   * to this channel's inbox.
   *
   * @param envelope - The sync envelope to receive
   * @throws {InternalChannelError} If channel is shutdown
   */
  receive(envelope: SyncEnvelope): void {
    if (this.isShutdown) {
      throw new InternalChannelError(
        `Channel ${this.channelId} is shutdown and cannot receive envelopes`,
      );
    }

    if (envelope.type === "operations" && envelope.operations) {
      const job = envelopeToJobHandle(envelope, this.remoteName);
      job.transported();
      this.inbox.add(job);
    }
  }

  /**
   * Updates the synchronization cursor for this channel's remote.
   *
   * Cursors track progress through the operation stream and enable resuming
   * synchronization after restarts. The cursor is exclusive - the next sync
   * will start at cursorOrdinal + 1.
   *
   * @param cursorOrdinal - The last processed ordinal (exclusive)
   */
  async updateCursor(cursorOrdinal: number): Promise<void> {
    const cursor: RemoteCursor = {
      remoteName: this.remoteName,
      cursorOrdinal,
      lastSyncedAtUtcMs: Date.now(),
    };

    await this.cursorStorage.upsert(cursor);
  }

  /**
   * Handles jobs added to the outbox by sending them to the peer.
   *
   * This method is called automatically via the outbox.onAdded callback.
   * It converts the job to a SyncEnvelope and sends it via the send function.
   *
   * @param job - The job to transport
   */
  private handleOutboxAdded(job: JobHandle): void {
    if (this.isShutdown) {
      return;
    }

    try {
      job.started();

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: this.channelId },
        operations: job.operations,
      };

      this.send(envelope);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const channelError = new ChannelError(ChannelErrorSource.Outbox, err);
      job.failed(channelError);
      this.deadLetter.add(job);
      this.outbox.remove(job);
    }
  }
}
