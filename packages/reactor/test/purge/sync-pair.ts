import type { Kysely } from "kysely";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { Mailbox } from "../../src/sync/mailbox.js";
import type { IChannel } from "../../src/sync/interfaces.js";
import type { ConnectionStateSnapshot } from "../../src/sync/types.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import { buildClient, buildReactor } from "./helpers.js";

/** Channels wired by remote name: `toB` on A delivers to `toA` on B. */
export class ChannelSwitch {
  readonly channels = new Map<string, TestChannel>();
  readonly peers = new Map<string, string>();
  /** Remote names whose channels hold their outbox and never deliver. */
  readonly offline = new Set<string>();
  private readonly held = new Map<string, SyncEnvelope[]>();
  /** Every envelope delivered, by the receiving remote's name. */
  readonly delivered: Array<{ to: string; envelope: SyncEnvelope }> = [];

  factory(): IChannelFactory {
    return {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): IChannel => {
        if (this.offline.has(remoteName)) {
          return new OfflineChannel();
        }
        const send = (envelope: SyncEnvelope): void => {
          const peerName = this.peers.get(remoteName);
          if (!peerName) {
            throw new Error(`no peer is paired with '${remoteName}'`);
          }
          const peer = this.channels.get(peerName);
          if (!peer) {
            // Held until the peer's channel exists and its manager is wired.
            const held = this.held.get(peerName) ?? [];
            held.push(envelope);
            this.held.set(peerName, held);
            return;
          }
          this.delivered.push({ to: peerName, envelope });
          peer.receive(envelope);
        };
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          send,
        );
        this.channels.set(remoteName, channel);
        const held = this.held.get(remoteName);
        if (held) {
          this.held.delete(remoteName);
          setTimeout(() => {
            for (const envelope of held) {
              this.delivered.push({ to: remoteName, envelope });
              channel.receive(envelope);
            }
          }, 50);
        }
        return channel;
      },
    };
  }

  pair(a: string, b: string): void {
    this.peers.set(a, b);
    this.peers.set(b, a);
  }
}

export async function buildSyncedReactor(
  channelSwitch: ChannelSwitch,
  options: {
    kysely?: Kysely<Database>;
    featureFlags?: Partial<ReactorFeatureFlags>;
  } = {},
): Promise<InProcessReactorModule> {
  return buildReactor({
    ...options,
    sync: new SyncBuilder().withChannelFactory(channelSwitch.factory()),
  });
}

export async function buildSyncedClient(
  channelSwitch: ChannelSwitch,
  options: { kysely?: Kysely<Database> } = {},
) {
  return buildClient({
    ...options,
    sync: new SyncBuilder().withChannelFactory(channelSwitch.factory()),
  });
}

export const FILTER = { documentId: [], scope: [], branch: "main" };

/** Remote names for a drive's pair: A holds `toB`, B holds `toA`. */
export function remoteNames(driveId: string): { toB: string; toA: string } {
  return { toB: `toB-${driveId}`, toA: `toA-${driveId}` };
}

export async function connect(
  channelSwitch: ChannelSwitch,
  a: InProcessReactorModule,
  b: InProcessReactorModule,
  driveId: string,
): Promise<void> {
  const { toB, toA } = remoteNames(driveId);
  channelSwitch.pair(toB, toA);
  const collectionId = DriveCollectionId.forDrive(driveId);
  // B first: A's backfill sends at once, and needs B's channel to exist.
  await b.syncModule!.syncManager.add(
    toA,
    collectionId,
    { type: "internal", parameters: {} },
    FILTER,
  );
  await a.syncModule!.syncManager.add(
    toB,
    collectionId,
    { type: "internal", parameters: {} },
    FILTER,
  );
}

/** Document ids whose operations reached the named remote's channel. */
export function deliveredDocumentIds(
  channelSwitch: ChannelSwitch,
  to: string,
  since = 0,
): Set<string> {
  const ids = new Set<string>();
  for (const { to: name, envelope } of channelSwitch.delivered.slice(since)) {
    if (name !== to) continue;
    for (const op of envelope.operations ?? []) {
      ids.add(op.context.documentId);
    }
  }
  return ids;
}

/** A peer that never answers: its outbox fills and nothing is acknowledged. */
export class OfflineChannel implements IChannel {
  readonly inbox = new Mailbox();
  readonly outbox = new Mailbox();
  readonly deadLetter = new Mailbox();

  init(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  getConnectionState(): ConnectionStateSnapshot {
    return {
      state: "disconnected",
      failureCount: 3,
      lastSuccessUtcMs: 1234,
      lastFailureUtcMs: 5678,
      pushBlocked: true,
      pushFailureCount: 3,
      receivingPages: false,
      requiresAuth: false,
    };
  }

  onConnectionStateChange(): () => void {
    return () => {};
  }

  triggerPull(): void {}

  notePoll(): void {}

  lastHolderPollUtcMs(): number | undefined {
    return undefined;
  }
}
