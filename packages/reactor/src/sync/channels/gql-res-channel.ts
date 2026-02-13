import type { ISyncCursorStorage } from "../../storage/interfaces.js";
import type { IChannel } from "../interfaces.js";
import { Mailbox } from "../mailbox.js";

/**
 * Channel for cursor-based polling by external clients.
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
  }

  shutdown(): Promise<void> {
    this.isShutdown = true;
    return Promise.resolve();
  }

  async init(): Promise<void> {
    // get cursors
    const cursors = await this.cursorStorage.list(this.remoteName);
    this.inbox.init(
      cursors.find((c) => c.cursorType === "inbox")?.cursorOrdinal ?? 0,
    );
    this.outbox.init(
      cursors.find((c) => c.cursorType === "outbox")?.cursorOrdinal ?? 0,
    );
  }
}
