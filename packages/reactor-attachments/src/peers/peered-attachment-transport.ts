import {
  GQL_CHANNEL_TYPE,
  type AttachmentHash,
  type ISyncManager,
  type JwtHandler,
} from "@powerhousedao/reactor";
import type { IAttachmentTransport } from "../interfaces.js";
import { sha256Hex } from "../replication/hash.js";
import { collectStream, streamFromBytes } from "../storage/local/bytes.js";
import { SwitchboardAttachmentTransport } from "../switchboard/switchboard-attachment-transport.js";
import type { TransportFetchResult } from "../types.js";

type DataResult = Extract<TransportFetchResult, { kind: "data" }>;

/** What the sources that did not answer data said, ranked by the combine rule. */
class Answers {
  pending: TransportFetchResult | undefined;
  firstError: Error | undefined;

  error(error: unknown): void {
    this.firstError ??=
      error instanceof Error ? error : new Error(String(error));
  }

  result(): TransportFetchResult {
    if (this.pending) {
      return this.pending;
    }
    if (this.firstError !== undefined) {
      throw this.firstError;
    }
    return { kind: "not-found" };
  }
}

/** Collects and checks a body, so a source's wrong bytes are its own error. */
async function verified(
  hash: AttachmentHash,
  result: DataResult,
): Promise<DataResult> {
  const bytes = await collectStream(result.response.body);
  const actual = await sha256Hex(bytes);
  if (actual !== hash) {
    throw new Error(
      `Attachment bytes for ${hash} hashed to ${actual}; the source served content that is not what was asked for`,
    );
  }
  return {
    kind: "data",
    response: { ...result.response, body: streamFromBytes(bytes) },
  };
}

export type PeeredAttachmentTransportOptions = {
  /** Read at fetch time for the Switchboard origins of its gql remotes. */
  syncManager?: Pick<ISyncManager, "list">;
  /** An attachment host that is not one of the sync remotes. */
  switchboardUrl?: string;
  jwtHandler?: JwtHandler;
  fetchFn?: typeof fetch;
};

/**
 * Peers in parallel, then Switchboards in turn; verified data > pending >
 * error > unanimous not-found.
 */
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
    const peers = [...this.peers.values()].map((entry) => entry.transport);
    const switchboards = this.switchboardSources().map((url) =>
      this.switchboardFor(url),
    );
    if (peers.length === 0 && switchboards.length === 0) {
      return { kind: "not-found" };
    }

    const answers = new Answers();
    if (peers.length > 0) {
      const data = await this.askPeers(
        peers,
        hash,
        documentId,
        answers,
        signal,
      );
      if (data) {
        return data;
      }
    }
    for (const switchboard of switchboards) {
      if (signal?.aborted) {
        break;
      }
      const data = await this.ask(
        switchboard,
        hash,
        documentId,
        answers,
        signal,
      );
      if (data) {
        return data;
      }
    }
    return answers.result();
  }

  private async ask(
    source: IAttachmentTransport,
    hash: AttachmentHash,
    documentId: string,
    answers: Answers,
    signal: AbortSignal | undefined,
  ): Promise<DataResult | undefined> {
    let result: TransportFetchResult;
    try {
      result = await source.fetch(hash, documentId, signal);
    } catch (error) {
      answers.error(error);
      return undefined;
    }
    if (result.kind === "pending") {
      answers.pending ??= result;
      return undefined;
    }
    if (result.kind === "not-found") {
      return undefined;
    }
    try {
      return await verified(hash, result);
    } catch (error) {
      answers.error(error);
      return undefined;
    }
  }

  /** The first verified data wins and cancels the other peers. */
  private askPeers(
    peers: IAttachmentTransport[],
    hash: AttachmentHash,
    documentId: string,
    answers: Answers,
    signal: AbortSignal | undefined,
  ): Promise<DataResult | undefined> {
    const controllers = peers.map(() => new AbortController());
    const abortAll = (): void => {
      for (const controller of controllers) controller.abort();
    };
    if (signal?.aborted) {
      abortAll();
    }
    signal?.addEventListener("abort", abortAll, { once: true });

    return new Promise<DataResult | undefined>((resolve) => {
      let remaining = peers.length;
      let won = false;
      peers.forEach((peer, index) => {
        void this.ask(
          peer,
          hash,
          documentId,
          answers,
          controllers[index].signal,
        ).then((data) => {
          remaining -= 1;
          if (data && !won) {
            won = true;
            controllers.forEach((controller, other) => {
              if (other !== index) controller.abort();
            });
            resolve(data);
            return;
          }
          if (remaining === 0 && !won) {
            resolve(undefined);
          }
        });
      });
    }).finally(() => signal?.removeEventListener("abort", abortAll));
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
