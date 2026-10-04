import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../../src/core/reactor-client-builder.js";
import { EventBus } from "../../../../src/events/event-bus.js";
import { GQL_CHANNEL_TYPE } from "../../../../src/sync/channels/gql-request-channel-factory.js";
import {
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
} from "../../../../src/sync/channels/local-channel-factory.js";
import {
  messagePortTransport,
  type LocalChannelPort,
} from "../../../../src/sync/channels/local-channel-transport.js";
import { SyncBuilder } from "../../../../src/sync/sync-builder.js";
import { ChannelScheme } from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";
import {
  addFolder,
  create,
  folders,
  has,
  type Node as FleetNode,
} from "../../peer-agreement/fleet.js";

const FILTER = { documentId: [], scope: [], branch: "main" };
const HUB_URL = "https://switchboard.test/graphql";

/** Every reactor in this file is a fleet node plus its local-port registry. */
type Peer = FleetNode & {
  transports: Map<string, LocalChannelPort>;
};

type GraphQLRequest = {
  query: string;
  variables: Record<string, unknown>;
};

/** A polled envelope as it crosses the wire; relayed between sides verbatim. */
type WireEnvelope = {
  type: string;
  channelMeta: { id: string };
  operations?: Array<{ context: { ordinal: number } }>;
};

function portKey(peerId: string, channelName: string): string {
  return `${peerId} ${channelName}`;
}

/**
 * A Switchboard double at the network boundary: it absorbs each side's pushed
 * envelopes and hands them to the other side's next poll, which is what a real
 * Switchboard does for two Connect reactors on one collection.
 *
 * Everything inside each process - the composite factory, the gql factory, the
 * poll timer, the channel, the sync manager, the job queue, the store - is the
 * real implementation. Only `fetch` is replaced, so no test opens a socket.
 */
class FakeSwitchboard {
  readonly requests = new Map<string, GraphQLRequest[]>();

  private readonly waiting = new Map<string, WireEnvelope[]>();
  private readonly absorbed = new Map<string, number>();

  /** The `fetchFn` one side's gql remote is configured with. */
  fetchFor(side: string, peer: string): typeof fetch {
    const fetchFn = (_url: string, init: RequestInit): Promise<Response> => {
      const body = JSON.parse(init.body as string) as GraphQLRequest;
      this.record(side, body);
      if (body.query.includes("touchChannel")) {
        return this.reply({
          touchChannel: { success: true, ackOrdinal: this.ackFor(side) },
        });
      }
      if (body.query.includes("pushSyncEnvelopes")) {
        this.absorb(side, peer, body);
        return this.reply({ pushSyncEnvelopes: true });
      }
      return this.reply({
        pollSyncEnvelopes: {
          envelopes: this.drain(side),
          ackOrdinal: this.ackFor(side),
          deadLetters: [],
          hasMore: false,
        },
      });
    };
    return fetchFn as unknown as typeof fetch;
  }

  /** Every envelope the named side pushed, in push order. */
  pushedBy(side: string): WireEnvelope[] {
    const pushes: WireEnvelope[] = [];
    for (const request of this.requests.get(side) ?? []) {
      if (!request.query.includes("pushSyncEnvelopes")) {
        continue;
      }
      pushes.push(...(request.variables.envelopes as WireEnvelope[]));
    }
    return pushes;
  }

  /** Whether the named side has polled at least once. */
  hasPolled(side: string): boolean {
    return (this.requests.get(side) ?? []).some((request) =>
      request.query.includes("pollSyncEnvelopes"),
    );
  }

  private record(side: string, request: GraphQLRequest): void {
    const existing = this.requests.get(side);
    if (existing) {
      existing.push(request);
      return;
    }
    this.requests.set(side, [request]);
  }

  private reply(data: unknown): Promise<Response> {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data }),
    } as unknown as Response);
  }

  /**
   * Takes a push and queues it for the peer. The acknowledged ordinal is the
   * highest the pusher has handed over, so the pusher's outbox trims exactly
   * as it would against a real server.
   */
  private absorb(side: string, peer: string, request: GraphQLRequest): void {
    const envelopes = request.variables.envelopes as WireEnvelope[];
    let highest = this.ackFor(side);
    for (const envelope of envelopes) {
      for (const operation of envelope.operations ?? []) {
        highest = Math.max(highest, operation.context.ordinal);
      }
    }
    this.absorbed.set(side, highest);
    const queue = this.waiting.get(peer);
    if (queue) {
      queue.push(...envelopes);
      return;
    }
    this.waiting.set(peer, [...envelopes]);
  }

  private drain(side: string): WireEnvelope[] {
    const queue = this.waiting.get(side) ?? [];
    this.waiting.set(side, []);
    return queue;
  }

  private ackFor(side: string): number {
    return this.absorbed.get(side) ?? 0;
  }
}

type PeerOptions = {
  /** Registers a `LocalChannelFactory` for brokered peers. */
  local: boolean;
  /** Registers the CONNECT gql scheme, pointed at the hub as this side. */
  gql: boolean;
};

async function buildPeer(name: string, options: PeerOptions): Promise<Peer> {
  const transports = new Map<string, LocalChannelPort>();
  const localFactory = new LocalChannelFactory(
    createMockLogger(),
    (peerId, channelName) => transports.get(portKey(peerId, channelName)),
  );
  const reactorBuilder = new ReactorBuilder()
    .withLogger(createMockLogger())
    .withEventBus(new EventBus())
    .withDocumentModelSources([
      driveDocumentModelModule as never,
      documentModelDocumentModelModule,
    ]);

  if (options.gql) {
    reactorBuilder.withChannelScheme(ChannelScheme.CONNECT);
    if (options.local) {
      // The W3.0 seam: the builder keeps constructing the gql factory (only it
      // holds the job queue the poll timer needs) and composes the local one
      // onto it, instead of the caller having to choose one.
      reactorBuilder.withAdditionalChannelFactory(
        LOCAL_CHANNEL_TYPE,
        localFactory,
      );
    }
  } else {
    reactorBuilder.withSync(new SyncBuilder().withChannelFactory(localFactory));
  }

  const built = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withCreateSignaturePolicy("legacy")
    .buildModule();
  const module = built.reactorModule!;
  return {
    name,
    client: built.client,
    module,
    reactor: module.reactor,
    sync: module.syncModule!.syncManager,
    transports,
  };
}

/** Brokers one MessageChannel between two peers and adds both local remotes. */
async function linkLocal(
  a: Peer,
  b: Peer,
  driveId: string,
): Promise<MessagePort[]> {
  const { port1, port2 } = new MessageChannel();
  port1.unref();
  port2.unref();
  a.transports.set(portKey(b.name, driveId), messagePortTransport(port1));
  b.transports.set(portKey(a.name, driveId), messagePortTransport(port2));

  const collection = DriveCollectionId.forDrive(driveId);
  await a.sync.add(
    `local:${b.name}`,
    collection,
    {
      type: LOCAL_CHANNEL_TYPE,
      parameters: { peerId: b.name, channelName: driveId },
    },
    FILTER,
  );
  await b.sync.add(
    `local:${a.name}`,
    collection,
    {
      type: LOCAL_CHANNEL_TYPE,
      parameters: { peerId: a.name, channelName: driveId },
    },
    FILTER,
  );
  return [port1, port2];
}

async function addGqlRemote(
  peer: Peer,
  driveId: string,
  fetchFn: typeof fetch,
): Promise<void> {
  await peer.sync.add(
    "gql:hub",
    DriveCollectionId.forDrive(driveId),
    {
      type: GQL_CHANNEL_TYPE,
      parameters: {
        url: HUB_URL,
        pollIntervalMs: 50,
        retryBaseDelayMs: 10,
        retryMaxDelayMs: 200,
        fetchFn,
      },
    },
    FILTER,
  );
}

describe("a reactor holding gql and local remotes at once", () => {
  const peers: Peer[] = [];
  const ports: MessagePort[] = [];

  afterEach(() => {
    for (const peer of peers) {
      peer.reactor.kill();
    }
    peers.length = 0;
    for (const port of ports) {
      port.close();
    }
    ports.length = 0;
  });

  it("syncs one drive over a brokered local link and a gql remote simultaneously", async () => {
    const hub = new FakeSwitchboard();
    // `mixed` is the W3.0 subject: CONNECT scheme AND a local factory on one
    // reactor. `sibling` is a brokered local peer; `cloud` is a second Connect
    // reactor reachable only through the hub.
    const mixed = await buildPeer("mixed", { local: true, gql: true });
    const sibling = await buildPeer("sibling", { local: true, gql: false });
    const cloud = await buildPeer("cloud", { local: false, gql: true });
    peers.push(mixed, sibling, cloud);

    const driveId = "mixed-drive";
    ports.push(...(await linkLocal(mixed, sibling, driveId)));
    await addGqlRemote(mixed, driveId, hub.fetchFor("mixed", "cloud"));
    await addGqlRemote(cloud, driveId, hub.fetchFor("cloud", "mixed"));

    // One reactor, two transports, both live.
    expect(
      mixed.sync
        .list()
        .map((remote) => remote.meta.channelConfig.type)
        .sort(),
    ).toEqual([GQL_CHANNEL_TYPE, LOCAL_CHANNEL_TYPE]);

    await create(mixed, driveId, {});

    // The local arm: no server, no polling.
    await vi.waitFor(
      async () => expect(await has(sibling, driveId)).toBe(true),
      { timeout: 20_000 },
    );
    // The gql arm, on the same reactor and the same collection: the drive
    // reached the second Connect reactor through the hub.
    await vi.waitFor(async () => expect(await has(cloud, driveId)).toBe(true), {
      timeout: 20_000,
    });
    expect(hub.hasPolled("mixed")).toBe(true);
    expect(hub.pushedBy("mixed").length).toBeGreaterThan(0);

    // Inbound over gql, then relayed onward over local: the sibling never
    // talks to the hub, so "fromCloud" can only have arrived through `mixed`.
    await addFolder(cloud, driveId, "fromCloud");
    await vi.waitFor(
      async () => expect(await folders(mixed, driveId)).toContain("fromCloud"),
      { timeout: 20_000 },
    );
    await vi.waitFor(
      async () =>
        expect(await folders(sibling, driveId)).toContain("fromCloud"),
      { timeout: 20_000 },
    );

    // And the reverse crossing: in over the local link, out over gql.
    await addFolder(sibling, driveId, "fromSibling");
    await vi.waitFor(
      async () =>
        expect(await folders(cloud, driveId)).toContain("fromSibling"),
      { timeout: 20_000 },
    );

    expect((await folders(mixed, driveId)).sort()).toEqual([
      "fromCloud",
      "fromSibling",
    ]);
  }, 90_000);

  // The composite is the only thing that can answer this, and the answer is
  // what a single-factory reactor could never give: which types it does serve.
  it("refuses a remote whose channel type no composed factory claims", async () => {
    const hub = new FakeSwitchboard();
    const mixed = await buildPeer("mixed", { local: true, gql: true });
    peers.push(mixed);
    await addGqlRemote(mixed, "refusal-drive", hub.fetchFor("mixed", "cloud"));

    await expect(
      mixed.sync.add(
        "carrier-pigeon",
        DriveCollectionId.forDrive("refusal-drive"),
        { type: "carrier-pigeon", parameters: {} },
        FILTER,
      ),
    ).rejects.toThrow(
      'This reactor has no "carrier-pigeon" channel factory: it composes factories for [gql, local]',
    );
  }, 40_000);
});
