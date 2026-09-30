import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type OperationWithContext,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../src/core/reactor-client-builder.js";
import type {
  Database,
  InProcessReactorModule,
  IReactor,
} from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { JobStatus } from "../../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type {
  IChannel,
  IChannelFactory,
  ISyncManager,
} from "../../../src/sync/interfaces.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import type {
  ChannelConfig,
  RemoteOptions,
  SyncEnvelope,
} from "../../../src/sync/types.js";
import { createMockLogger } from "../../factories.js";
import {
  TestChannel,
  type TestChannelOptions,
} from "../channels/test-channel.js";

/** Baseline [1]; `wide` reactors also run 2 and prefer it. */
export const testProtocol = (versions: number[]): PeerCapability => ({
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => versions,
  preferred: () => Math.max(...versions),
  optional: true,
});

export const NARROW = [1];
export const WIDE = [1, 2];

export const manifestFor = (versions: number[]): PeerManifest =>
  localPeerManifest(
    mergePeerCapabilities(PEER_CAPABILITIES, [testProtocol(versions)]),
    {},
  );

/** `bare`: the sync manager gets the channel without either manifest method. */
export type LinkOptions = TestChannelOptions & { bare?: boolean };

/** A third-party IChannel from before manifests. */
function bare(channel: TestChannel): IChannel {
  return {
    inbox: channel.inbox,
    outbox: channel.outbox,
    deadLetter: channel.deadLetter,
    init: () => channel.init(),
    shutdown: () => channel.shutdown(),
    getConnectionState: () => channel.getConnectionState(),
    onConnectionStateChange: (callback) =>
      channel.onConnectionStateChange(callback),
    triggerPull: () => channel.triggerPull(),
    notePoll: () => channel.notePoll(),
    lastHolderPollUtcMs: () => channel.lastHolderPollUtcMs(),
  };
}

export type Node = {
  name: string;
  client: ReactorClient;
  module: InProcessReactorModule;
  reactor: IReactor;
  sync: ISyncManager;
};

const FILTER = { documentId: [], scope: [], branch: "main" };

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";
let databaseCounter = 0;

/** Reactors joined pairwise over TestChannels; a remote is named `from->to`. */
export class Fleet {
  readonly channels = new Map<string, TestChannel>();
  /** Every operation handed to a channel's inbox, by channel name. */
  readonly delivered = new Map<string, OperationWithContext[]>();
  private readonly options = new Map<string, LinkOptions>();
  // Channels whose sync manager has wired them; others get envelopes queued.
  private readonly ready = new Set<string>();
  private readonly queued = new Map<string, SyncEnvelope[]>();
  private readonly nodes: Node[] = [];
  private readonly databases: Array<{ name: string; db: Kysely<Database> }> =
    [];

  /** `postgres`: each node gets its own database; release with dispose(). */
  constructor(private readonly config: { postgres?: boolean } = {}) {}

  private async database(): Promise<Kysely<Database>> {
    const name = `fleet_${process.pid}_${databaseCounter++}`;
    const admin = new Pool({ connectionString: PG_TEST_URL });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
    const url = new URL(PG_TEST_URL);
    url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString(), max: 8 });
    // Dropping the database terminates whatever is still connected to it.
    pool.on("error", (error: Error & { code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    this.databases.push({ name, db });
    return db;
  }

  async node(name: string, versions: number[]): Promise<Node> {
    const factory: IChannelFactory = {
      instance: (
        remoteId: string,
        remoteName: string,
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): IChannel => {
        if (config.type === "polling") {
          return new GqlResponseChannel(
            createMockLogger(),
            remoteId,
            remoteName,
            cursorStorage,
          );
        }
        const [pair, tag] = remoteName.split("#");
        const peerName =
          pair.split("->").reverse().join("->") + (tag ? `#${tag}` : "");
        const options = this.options.get(remoteName);
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope: SyncEnvelope) => {
            // A backfill can start before the other side of its link exists.
            if (!this.ready.has(peerName)) {
              const queued = this.queued.get(peerName) ?? [];
              queued.push(envelope);
              this.queued.set(peerName, queued);
              return;
            }
            this.deliver(peerName, envelope);
          },
          {
            ...options,
            peer: () => this.channels.get(peerName),
          },
        );
        this.channels.set(remoteName, channel);
        return options?.bare ? bare(channel) : channel;
      },
    } as IChannelFactory;

    const builder = new ReactorBuilder()
      .withLogger(createMockLogger())
      .withEventBus(new EventBus())
      .withDocumentModelSources([
        driveDocumentModelModule as never,
        documentModelDocumentModelModule,
      ])
      .withPeerCapabilities([testProtocol(versions)])
      .withSync(new SyncBuilder().withChannelFactory(factory));
    if (this.config.postgres) builder.withKysely(await this.database());

    const built = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      // Unsigned test writes: legacy documents.
      .withCreateSignaturePolicy("legacy")
      .buildModule();
    const module = built.reactorModule!;
    const node = {
      name,
      client: built.client,
      module,
      reactor: module.reactor,
      sync: module.syncModule!.syncManager,
    };
    this.nodes.push(node);
    return node;
  }

  private deliver(name: string, envelope: SyncEnvelope): void {
    const peer = this.channels.get(name);
    if (!peer) throw new Error(`no channel ${name}`);
    peer.receive(envelope);
    const delivered = this.delivered.get(name) ?? [];
    delivered.push(...(envelope.operations ?? []));
    this.delivered.set(name, delivered);
  }

  /** Delivers what was sent to `name` before its sync manager wired it. */
  private open(name: string): void {
    this.ready.add(name);
    for (const envelope of this.queued.get(name)?.splice(0) ?? []) {
      this.deliver(name, envelope);
    }
  }

  /** Both directions of a channel for `driveId`'s collection; `tag` tells apart a second pair. */
  async link(
    a: Node,
    b: Node,
    driveId: string,
    options: {
      a?: LinkOptions;
      b?: LinkOptions;
      tag?: string;
      /** Remote options for `a`'s side. */
      remote?: RemoteOptions;
    } = {},
  ): Promise<void> {
    const suffix = options.tag ? `#${options.tag}` : "";
    const toB = `${a.name}->${b.name}${suffix}`;
    const toA = `${b.name}->${a.name}${suffix}`;
    this.options.set(toB, options.a ?? {});
    this.options.set(toA, options.b ?? {});
    const collection = DriveCollectionId.forDrive(driveId);
    const config = { type: "internal", parameters: {} };
    await a.sync.add(toB, collection, config, FILTER, options.remote);
    this.open(toB);
    await b.sync.add(toA, collection, config, FILTER);
    this.open(toA);
  }

  kill(): void {
    for (const node of this.nodes.splice(0)) {
      node.reactor.kill();
    }
    // A later test's channel must not handshake with this one's.
    this.channels.clear();
    this.options.clear();
    this.delivered.clear();
    this.ready.clear();
    this.queued.clear();
  }

  /** kill(), then waits for every node to stop and drops its database. */
  async dispose(): Promise<void> {
    for (const node of this.nodes.splice(0)) {
      await node.reactor.kill().completed;
      await node.sync.shutdown().completed;
    }
    this.channels.clear();
    this.options.clear();
    this.delivered.clear();
    this.ready.clear();
    this.queued.clear();
    const admin = new Pool({ connectionString: PG_TEST_URL });
    try {
      for (const { name, db } of this.databases.splice(0)) {
        await db.destroy();
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin.end();
    }
  }
}

export function driveAt(id: string, protocolVersions: Record<string, number>) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id, protocolVersions },
  );
}

export async function settled(reactor: IReactor, jobId: string) {
  await vi.waitUntil(
    async () => {
      const { status } = await reactor.getJobStatus(jobId);
      return status === JobStatus.READ_READY || status === JobStatus.FAILED;
    },
    { timeout: 10_000, interval: 5 },
  );
  return reactor.getJobStatus(jobId);
}

export async function create(
  node: Node,
  id: string,
  protocolVersions: Record<string, number>,
) {
  const info = await node.reactor.create(driveAt(id, protocolVersions));
  const job = await settled(node.reactor, info.id);
  if (job.status !== JobStatus.READ_READY) {
    throw new Error(`create of ${id} failed: ${job.error?.message}`);
  }
}

export async function addFolder(node: Node, driveId: string, id: string) {
  const info = await node.reactor.execute(driveId, "main", [
    driveDocumentModelModule.actions.addFolder({
      id,
      name: id,
      parentFolder: null,
    }),
  ]);
  await settled(node.reactor, info.id);
}

export async function has(node: Node, documentId: string): Promise<boolean> {
  try {
    await node.reactor.get(documentId, { branch: "main" });
    return true;
  } catch {
    return false;
  }
}

export async function folders(node: Node, driveId: string): Promise<string[]> {
  const document = (await node.reactor.get(driveId, {
    branch: "main",
  })) as unknown as { state: { global: { nodes: Array<{ id: string }> } } };
  return document.state.global.nodes.map((n) => n.id);
}

/** Lets in-flight sync settle before asserting that something did not arrive. */
export const quiesce = () => new Promise((resolve) => setTimeout(resolve, 300));
