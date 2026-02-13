import type { ILogger } from "../../logging/types.js";
import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel } from "../interfaces.js";
import { Mailbox } from "../mailbox.js";
import { getLatestAppliedOrdinal } from "./utils.js";

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
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.outbox.ackOrdinal) {
        this.cursorStorage
          .upsert({
            remoteName: this.remoteName,
            cursorType: "outbox",
            cursorOrdinal: maxOrdinal,
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
    });

    this.inbox.onRemoved((syncOps) => {
      const maxOrdinal = getLatestAppliedOrdinal(syncOps);
      if (maxOrdinal > this.inbox.ackOrdinal) {
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
    return Promise.resolve();
  }

  async init(): Promise<void> {
    // get cursors -- these are the last acknowledged ordinals for the inbox and outbox
    const cursors = await this.cursorStorage.list(this.remoteName);
    this.inbox.init(
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0,
    );
    this.outbox.init(
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0,
    );
  }
}
