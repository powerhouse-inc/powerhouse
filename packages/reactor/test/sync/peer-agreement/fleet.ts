import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  localPeerManifest,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type {
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

export type Node = {
  name: string;
  module: InProcessReactorModule;
  reactor: IReactor;
  sync: ISyncManager;
};

const FILTER = { documentId: [], scope: [], branch: "main" };

/** Reactors joined pairwise over TestChannels; a remote is named `from->to`. */
export class Fleet {
  readonly channels = new Map<string, TestChannel>();
  private readonly options = new Map<string, TestChannelOptions>();
  private readonly nodes: Node[] = [];

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
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope: SyncEnvelope) => {
            const peer = this.channels.get(peerName);
            if (!peer) throw new Error(`no channel ${peerName}`);
            peer.receive(envelope);
          },
          {
            ...this.options.get(remoteName),
            peer: () => this.channels.get(peerName),
          },
        );
        this.channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;

    const module = await new ReactorBuilder()
      .withLogger(createMockLogger())
      .withEventBus(new EventBus())
      .withDocumentModelSources([driveDocumentModelModule as never])
      .withPeerCapabilities([testProtocol(versions)])
      .withSync(new SyncBuilder().withChannelFactory(factory))
      .buildModule();
    const node = {
      name,
      module,
      reactor: module.reactor,
      sync: module.syncModule!.syncManager,
    };
    this.nodes.push(node);
    return node;
  }

  /** Both directions of a channel for `driveId`'s collection; `tag` tells apart a second pair. */
  async link(
    a: Node,
    b: Node,
    driveId: string,
    options: {
      a?: TestChannelOptions;
      b?: TestChannelOptions;
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
    await b.sync.add(toA, collection, config, FILTER);
  }

  kill(): void {
    for (const node of this.nodes.splice(0)) {
      node.reactor.kill();
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
