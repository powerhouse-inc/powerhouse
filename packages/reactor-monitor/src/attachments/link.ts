import type { MessagePortLike } from "@powerhousedao/reactor";
import type { ManagedReactor } from "../types.js";

/** A live attachment link between two reactors, and the lever that tears it down. */
export type AttachmentLinkHandle = {
  readonly reactorA: string;
  readonly reactorB: string;
  readonly channelName: string;
  unlink: () => Promise<void>;
};

export type LinkAttachmentsOptions = {
  /** Label both ends key the brokered port under. */
  channelName: string;
  /** Opens the broker's channel; defaults to the global `MessageChannel`. */
  createChannel?: () => { port1: MessagePortLike; port2: MessagePortLike };
};

function defaultCreateChannel(): {
  port1: MessagePortLike;
  port2: MessagePortLike;
} {
  const channel = new MessageChannel();
  return {
    port1: channel.port1 as unknown as MessagePortLike,
    port2: channel.port2 as unknown as MessagePortLike,
  };
}

/**
 * Brokers an attachment-byte link between two monitor-owned reactors
 * (multi-reactor W3.4).
 *
 * Exactly the shape `linkLocalSync` already has -- the monitor opens one
 * `MessageChannel` and hands each reactor an end -- on a SEPARATE channel from
 * sync. Attachment bodies are chunked and can be large, and sharing the sync
 * wire would make one big transfer delay operation delivery.
 *
 * All or nothing, for the same reason the sync link is: if `b` refuses after
 * `a` accepted, `a`'s link is removed and both ports closed. A half link would
 * leave one reactor believing it can pull bytes from a peer that is not
 * listening.
 *
 * Returns undefined when either reactor has no attachment module at all, so a
 * caller can broker sync for a pair where only one side holds bytes without
 * having to check first.
 */
export async function linkLocalAttachments(
  a: ManagedReactor,
  b: ManagedReactor,
  options: LinkAttachmentsOptions,
): Promise<AttachmentLinkHandle | undefined> {
  if (a.name === b.name) {
    throw new Error("linkLocalAttachments requires two distinct reactors");
  }
  if (!a.attachments || !b.attachments) {
    return undefined;
  }

  const { port1, port2 } = (options.createChannel ?? defaultCreateChannel)();
  const channelName = options.channelName;

  try {
    await a.attachments.adoptPeer({
      peerId: b.name,
      channelName,
      port: port1,
    });
  } catch (error) {
    closeBoth(port1, port2);
    throw error;
  }

  try {
    await b.attachments.adoptPeer({
      peerId: a.name,
      channelName,
      port: port2,
    });
  } catch (error) {
    try {
      await a.attachments.removePeer(b.name, channelName);
    } catch (rollbackError) {
      console.error(
        `[reactor-monitor] rolling back the attachment link on "${a.name}" failed:`,
        rollbackError,
      );
    }
    closeBoth(port1, port2);
    throw error;
  }

  let unlinked = false;
  return {
    reactorA: a.name,
    reactorB: b.name,
    channelName,
    // Both ends are always attempted before any failure is surfaced, and a
    // second call is a safe no-op: a retry after a partial failure must not
    // raise a fresh "no link to remove" that buries the original error.
    unlink: async () => {
      if (unlinked) {
        return;
      }
      unlinked = true;
      const results = await Promise.allSettled([
        a.attachments!.removePeer(b.name, channelName),
        b.attachments!.removePeer(a.name, channelName),
      ]);
      // Both ends were attempted; surface the first failure, if any.
      for (const result of results) {
        if (result.status === "rejected") {
          throw result.reason;
        }
      }
    },
  };
}

function closeBoth(port1: MessagePortLike, port2: MessagePortLike): void {
  try {
    port1.close();
  } catch {
    // A transferred port is not ours to close.
  }
  try {
    port2.close();
  } catch {
    // Same.
  }
}
