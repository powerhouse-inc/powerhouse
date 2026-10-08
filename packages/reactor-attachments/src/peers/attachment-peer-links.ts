import type { LocalChannelPort } from "@powerhousedao/reactor";
import type { IAttachmentStore } from "../interfaces.js";
import {
  LocalAttachmentServer,
  type LocalAttachmentAuthorizer,
} from "../local/local-attachment-server.js";
import { LocalAttachmentTransport } from "../local/local-attachment-transport.js";
import type { PeeredAttachmentTransport } from "./peered-attachment-transport.js";

export type AttachmentServedStats = {
  served: number;
  bytesServed: number;
  refused: number;
};

export type AttachmentPeerLinksOptions = {
  /** What linked peers are served from. */
  store: IAttachmentStore;
  /** Where each link's pulling half is registered. */
  transport: PeeredAttachmentTransport;
  /** Absent, and absent on the link, every read is refused. */
  authorize?: LocalAttachmentAuthorizer;
  chunkSizeBytes?: number;
  requestTimeoutMs?: number;
  /** Called after a link is added; a host re-chases terminal hashes here. */
  onPeerAdded?: (peerId: string, channelName: string) => void;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

export type AttachmentPeerLinkOptions = {
  /** Replaces the links-wide authorizer for this link. */
  authorize?: LocalAttachmentAuthorizer;
};

/** Holds one raw listener for the link's life and fans it out to both halves. */
class LinkPort {
  private readonly subscribers = new Set<(data: unknown) => void>();
  private readonly detachRaw: () => void;

  constructor(
    private readonly raw: LocalChannelPort,
    private readonly onDiagnostic: (message: string, error?: unknown) => void,
  ) {
    this.detachRaw = raw.onMessage((data) => this.dispatch(data));
  }

  /** A view for one half; its close() is a no-op, the link owns the port. */
  view(): LocalChannelPort {
    return {
      postMessage: (data) => this.raw.postMessage(data),
      onMessage: (callback) => {
        this.subscribers.add(callback);
        return () => {
          this.subscribers.delete(callback);
        };
      },
      close: () => undefined,
    };
  }

  detach(): void {
    this.subscribers.clear();
    this.detachRaw();
  }

  release(): void {
    this.detach();
    try {
      this.raw.close();
    } catch (error) {
      this.onDiagnostic("closing an attachment link port failed", error);
    }
  }

  private dispatch(data: unknown): void {
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber(data);
      } catch (error) {
        this.onDiagnostic("an attachment link handler threw", error);
      }
    }
  }
}

type Link = {
  peerId: string;
  channelName: string;
  port: LinkPort;
  server: LocalAttachmentServer;
  transport: LocalAttachmentTransport;
};

/** Per-peer server and transport pairs, each on its own port, not the sync port. */
export class AttachmentPeerLinks {
  private readonly links = new Map<string, Link>();
  private readonly onDiagnostic: (message: string, error?: unknown) => void;

  constructor(private readonly options: AttachmentPeerLinksOptions) {
    this.onDiagnostic = options.onDiagnostic ?? ((): void => undefined);
  }

  has(peerId: string, channelName: string): boolean {
    return this.links.has(linkKey(peerId, channelName));
  }

  /** Takes ownership of `port` on success; on failure the port is untouched. */
  addPeer(
    peerId: string,
    channelName: string,
    port: LocalChannelPort,
    linkOptions: AttachmentPeerLinkOptions = {},
  ): void {
    const key = linkKey(peerId, channelName);
    if (this.links.has(key)) {
      throw new Error(
        `This reactor already holds an attachment link to peer '${peerId}' on channel '${channelName}'; remove it before linking again`,
      );
    }

    const linkPort = new LinkPort(port, this.onDiagnostic);
    const authorize = linkOptions.authorize ?? this.options.authorize;
    const server = new LocalAttachmentServer({
      port: linkPort.view(),
      link: { peerId, channelName },
      store: this.options.store,
      ...(authorize ? { authorize } : {}),
      ...(this.options.chunkSizeBytes !== undefined
        ? { chunkSizeBytes: this.options.chunkSizeBytes }
        : {}),
      onDiagnostic: this.onDiagnostic,
    });
    const transport = new LocalAttachmentTransport({
      port: linkPort.view(),
      ...(this.options.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: this.options.requestTimeoutMs }
        : {}),
    });

    try {
      this.options.transport.addPeer(peerId, channelName, transport);
    } catch (error) {
      server.close();
      transport.close();
      linkPort.detach();
      throw error;
    }

    this.links.set(key, {
      peerId,
      channelName,
      port: linkPort,
      server,
      transport,
    });
    try {
      this.options.onPeerAdded?.(peerId, channelName);
    } catch (error) {
      this.onDiagnostic("an attachment onPeerAdded hook threw", error);
    }
  }

  /** Closes the link's server, transport and port. False when absent. */
  removePeer(peerId: string, channelName: string): boolean {
    const key = linkKey(peerId, channelName);
    const link = this.links.get(key);
    if (!link) {
      return false;
    }
    this.links.delete(key);
    this.options.transport.removePeer(peerId, channelName);
    link.server.close();
    link.transport.close();
    link.port.release();
    return true;
  }

  servedStats(): AttachmentServedStats {
    const total: AttachmentServedStats = {
      served: 0,
      bytesServed: 0,
      refused: 0,
    };
    for (const link of this.links.values()) {
      const stats = link.server.stats();
      total.served += stats.served;
      total.bytesServed += stats.bytesServed;
      total.refused += stats.refused;
    }
    return total;
  }

  close(): void {
    for (const link of [...this.links.values()]) {
      this.removePeer(link.peerId, link.channelName);
    }
  }
}

function linkKey(peerId: string, channelName: string): string {
  return `${peerId}\u0000${channelName}`;
}
