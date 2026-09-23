import type { Kysely } from "kysely";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import type { Database, InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import { TestChannel } from "../sync/channels/test-channel.js";
import { buildReactor } from "./helpers.js";

/** Channels wired by remote name: `toB` on A delivers to `toA` on B. */
export class ChannelSwitch {
  readonly channels = new Map<string, TestChannel>();
  readonly peers = new Map<string, string>();
  /** Every envelope delivered, by the receiving remote's name. */
  readonly delivered: Array<{ to: string; envelope: SyncEnvelope }> = [];

  factory(): IChannelFactory {
    return {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel => {
        const send = (envelope: SyncEnvelope): void => {
          const peerName = this.peers.get(remoteName);
          const peer = peerName ? this.channels.get(peerName) : undefined;
          if (!peer || !peerName) {
            throw new Error(`peer channel for '${remoteName}' is missing`);
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
