import {
  GQL_CHANNEL_TYPE,
  type AttachmentHash,
  type ISyncManager,
  type JwtHandler,
} from "@powerhousedao/reactor";
import type { IAttachmentTransport } from "../interfaces.js";
import { SwitchboardAttachmentTransport } from "../switchboard/switchboard-attachment-transport.js";
import type { TransportFetchResult } from "../types.js";

export type PeeredAttachmentTransportOptions = {
  /** Read at fetch time for the Switchboard origins of its gql remotes. */
  syncManager?: Pick<ISyncManager, "list">;
  /** An attachment host that is not one of the sync remotes. */
  switchboardUrl?: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

/** Peers, then Switchboards; data > pending > error > unanimous not-found. */
export class PeeredAttachmentTransport implements IAttachmentTransport {
  private readonly syncManager: Pick<ISyncManager, "list"> | undefined;
  private readonly switchboardUrl: string | undefined;
  private readonly jwtHandler: JwtHandler | undefined;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly peers = new Map<
    string,
    { peerId: string; transport: IAttachmentTransport }
  >();
  private readonly switchboards = new Map<string, IAttachmentTransport>();

  constructor(options: PeeredAttachmentTransportOptions = {}) {
    this.syncManager = options.syncManager;
    this.switchboardUrl = options.switchboardUrl;
    this.jwtHandler = options.jwtHandler;
    this.fetchFn = options.fetchFn;
  }

  /** Keyed by (peerId, channelName), so one peer may hold several links. */
  addPeer(
    peerId: string,
    channelName: string,
    transport: IAttachmentTransport,
  ): void {
    const key = peerKey(peerId, channelName);
    if (this.peers.has(key)) {
      throw new Error(
        `An attachment peer is already registered for '${peerId}' on channel '${channelName}'; remove it before linking again`,
      );
    }
    this.peers.set(key, { peerId, transport });
  }

  /** Forgets one peer link; the caller owns closing its transport. */
  removePeer(
    peerId: string,
    channelName: string,
  ): IAttachmentTransport | undefined {
    const key = peerKey(peerId, channelName);
    const entry = this.peers.get(key);
    this.peers.delete(key);
    return entry?.transport;
  }

  /** Distinct linked peer ids. */
  peerNames(): readonly string[] {
    return [...new Set([...this.peers.values()].map((entry) => entry.peerId))];
  }

  /** The explicit Switchboard, then every gql remote's origin. */
  switchboardSources(): readonly string[] {
    const urls = new Set<string>();
    if (this.switchboardUrl) {
      urls.add(this.switchboardUrl);
    }
    for (const remote of this.syncManager?.list() ?? []) {
      if (remote.meta.channelConfig.type !== GQL_CHANNEL_TYPE) {
        continue;
      }
      const url = remote.meta.channelConfig.parameters.url;
      if (typeof url === "string" && url !== "") {
        urls.add(attachmentOriginOf(url));
      }
    }
    return [...urls];
  }

  async fetch(
    hash: AttachmentHash,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<TransportFetchResult> {
    const sources = this.sources();
    if (sources.length === 0) {
      return { kind: "not-found" };
    }

    let pending: TransportFetchResult | undefined;
    let firstError: Error | undefined;

    for (const source of sources) {
      let result: TransportFetchResult;
      try {
        result = await source.fetch(hash, documentId, signal);
      } catch (error) {
        firstError ??=
          error instanceof Error ? error : new Error(String(error));
        continue;
      }
      if (result.kind === "data") {
        return result;
      }
      if (result.kind === "pending") {
        pending ??= result;
      }
    }

    if (pending) {
      return pending;
    }
    if (firstError !== undefined) {
      throw firstError;
    }
    return { kind: "not-found" };
  }

  /** Best effort across every source. */
  async announce(hash: AttachmentHash): Promise<void> {
    await Promise.allSettled(
      this.sources().map((source) => source.announce(hash)),
    );
  }

  push(): Promise<void> {
    return Promise.reject(
      new Error(
        "PeeredAttachmentTransport is pull-only: bytes move when a reactor references a hash it lacks, not by being pushed",
      ),
    );
  }

  private sources(): IAttachmentTransport[] {
    return [
      ...[...this.peers.values()].map((entry) => entry.transport),
      ...this.switchboardSources().map((url) => this.switchboardFor(url)),
    ];
  }

  private switchboardFor(url: string): IAttachmentTransport {
    const existing = this.switchboards.get(url);
    if (existing) {
      return existing;
    }
    const transport = new SwitchboardAttachmentTransport({
      remoteUrl: url,
      ...(this.jwtHandler ? { jwtHandler: this.jwtHandler } : {}),
      ...(this.fetchFn ? { fetchFn: this.fetchFn } : {}),
    });
    this.switchboards.set(url, transport);
    return transport;
  }
}

/** NUL-joined so no peer id or channel name can forge another pair's key. */
function peerKey(peerId: string, channelName: string): string {
  return `${peerId}\u0000${channelName}`;
}

/** Attachments are served from the origin, not under the GraphQL path. */
export function attachmentOriginOf(graphqlUrl: string): string {
  try {
    return new URL(graphqlUrl).origin;
  } catch {
    const marker = graphqlUrl.lastIndexOf("/graphql");
    const base = marker >= 0 ? graphqlUrl.slice(0, marker) : graphqlUrl;
    return base.replace(/\/+$/, "");
  }
}
