import {
  GQL_CHANNEL_TYPE,
  type AttachmentHash,
  type ISyncManager,
  type JwtHandler,
} from "@powerhousedao/reactor";
import {
  SwitchboardAttachmentTransport,
  type IAttachmentTransport,
  type TransportFetchResult,
} from "@powerhousedao/reactor-attachments/replication";

export type MonitorAttachmentTransportOptions = {
  /**
   * The reactor's sync manager, read at FETCH time to discover Switchboard
   * origins from its gql remotes. Absent for a reactor with no sync module.
   */
  syncManager?: ISyncManager;
  /** An attachment host that is not one of the reactor's sync remotes. */
  switchboardUrl?: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

/**
 * The transport a monitor-provisioned reactor pulls attachment bytes through:
 * its brokered local peers first, then the Switchboards its own gql remotes
 * name (multi-reactor W3.4).
 *
 * Sources are derived at fetch time rather than wired at build time, and that
 * is the point. A reactor's remotes change under it -- the Sync tab adds a
 * Switchboard, `linkLocalSync` brokers a peer, a storage heal severs one -- so
 * a snapshot taken when the reactor was built would send byte requests to
 * remotes that no longer exist and miss the ones that do. Adding a gql remote
 * is therefore all it takes to make that Switchboard's attachments reachable.
 *
 * Local peers are tried first: they are in-realm MessagePort hops with no
 * network, so a hash a sibling reactor already holds costs nothing to get.
 *
 * Answers are combined by what each one licenses the caller to do, not by
 * order. One `data` answer wins outright. Failing that, one `pending`
 * anywhere means waiting is correct, so pending outranks `not-found` -- a
 * caller told not-found would spend its lag budget instead of its pending
 * budget. `not-found` is only reported when every source said so, and when no
 * source answered at all the first error is rethrown rather than being
 * laundered into a not-found, because "nobody could be reached" and "nobody
 * has it" lead to different operator actions.
 */
export class MonitorAttachmentTransport implements IAttachmentTransport {
  private readonly syncManager: ISyncManager | undefined;
  private readonly switchboardUrl: string | undefined;
  private readonly jwtHandler: JwtHandler | undefined;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly peers = new Map<string, IAttachmentTransport>();
  private readonly switchboards = new Map<string, IAttachmentTransport>();

  constructor(options: MonitorAttachmentTransportOptions = {}) {
    this.syncManager = options.syncManager;
    this.switchboardUrl = options.switchboardUrl;
    this.jwtHandler = options.jwtHandler;
    this.fetchFn = options.fetchFn;
  }

  /** Registers a brokered local peer under its reactor name. */
  addPeer(peerId: string, transport: IAttachmentTransport): void {
    if (this.peers.has(peerId)) {
      throw new Error(
        `An attachment peer is already registered for '${peerId}'; remove it before linking again`,
      );
    }
    this.peers.set(peerId, transport);
  }

  /** Forgets a peer; the caller owns closing its transport. */
  removePeer(peerId: string): IAttachmentTransport | undefined {
    const transport = this.peers.get(peerId);
    this.peers.delete(peerId);
    return transport;
  }

  peerNames(): readonly string[] {
    return [...this.peers.keys()];
  }

  /**
   * The Switchboard origins this transport would try right now: the explicit
   * one, plus every gql remote's url read off the live sync manager.
   */
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
    const sources: IAttachmentTransport[] = [
      ...this.peers.values(),
      ...this.switchboardSources().map((url) => this.switchboardFor(url)),
    ];
    if (sources.length === 0) {
      return { kind: "not-found" };
    }

    let pending: TransportFetchResult | undefined;
    let firstError: Error | undefined;
    let answered = false;

    for (const source of sources) {
      let result: TransportFetchResult;
      try {
        result = await source.fetch(hash, documentId, signal);
      } catch (error) {
        firstError ??=
          error instanceof Error ? error : new Error(String(error));
        continue;
      }
      answered = true;
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
    if (!answered && firstError !== undefined) {
      throw firstError;
    }
    return { kind: "not-found" };
  }

  /** Best effort across every source; a source that refuses is not an error here. */
  async announce(hash: AttachmentHash): Promise<void> {
    const sources = [
      ...this.peers.values(),
      ...this.switchboardSources().map((url) => this.switchboardFor(url)),
    ];
    await Promise.allSettled(sources.map((source) => source.announce(hash)));
  }

  /** Refuses: the agreed byte-movement model is pull-on-reference. */
  push(): Promise<void> {
    return Promise.reject(
      new Error(
        "MonitorAttachmentTransport is pull-only: bytes move when a reactor references a hash it lacks, not by being pushed",
      ),
    );
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

/**
 * The attachment origin behind a sync remote's GraphQL url.
 *
 * A gql remote names a GraphQL endpoint (`http://host/graphql/my-drive`), and
 * `SwitchboardAttachmentTransport` builds `${remoteUrl}/attachments/${hash}`,
 * so the GraphQL path has to come off first or the request would land under
 * the GraphQL route. Everything up to (and excluding) `/graphql` is the host's
 * origin, which is where the attachment route is mounted.
 */
export function attachmentOriginOf(graphqlUrl: string): string {
  const marker = graphqlUrl.indexOf("/graphql");
  const base = marker >= 0 ? graphqlUrl.slice(0, marker) : graphqlUrl;
  return base.replace(/\/+$/, "");
}
