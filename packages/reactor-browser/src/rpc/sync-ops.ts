import {
  DriveCollectionId,
  type ChannelConfig,
  type ConnectionStateSnapshot,
  type InspectableSyncManager,
  type Remote,
  type RemoteFilter,
  type RemoteMeta,
  type RemoteOptions,
} from "@powerhousedao/reactor";
import type { PeerManifest } from "@powerhousedao/shared/document-model";

export type { InspectableSyncManager } from "@powerhousedao/reactor";

/**
 * Wire method strings of the `sync-op` channel, in one place so the proxy that
 * sends them and `dispatchSyncOp` that resolves them stay in step. The
 * orchestration ops keep the bare names the wire shipped with; the W0.5
 * inspection and repair ops are additive, so no protocol-version bump is
 * needed.
 */
export const SYNC_OPS = {
  list: "list",
  add: "add",
  bindRemote: "bindRemote",
  setPeerManifest: "setPeerManifest",
  peerAgreementBasis: "peerAgreementBasis",
  listHolds: "listHolds",
  remove: "remove",
  triggerPull: "triggerPull",
  inspectRemote: "inspect.remote",
  inspectRemotes: "inspect.remotes",
  listDeadLetters: "deadLetters.list",
  rewindInboxCursor: "repair.rewindInboxCursor",
  resetChannel: "repair.resetChannel",
  requeueDeadLetter: "deadLetters.requeue",
  clearDeadLetter: "deadLetters.clear",
} as const;

export type SyncOp = (typeof SYNC_OPS)[keyof typeof SYNC_OPS];

/** Cloneable projection of a `Remote`: meta (carries channelConfig) + snapshot. */
export type WireRemote = {
  meta: RemoteMeta;
  connectionState: ConnectionStateSnapshot;
};

/**
 * The live `IChannel` cannot cross `postMessage`, so a remote is sent as its
 * meta plus a connection snapshot; `SyncManagerProxy` rehydrates exactly this.
 */
export function toWireRemote(remote: Remote): WireRemote {
  return {
    meta: remote.meta,
    connectionState: remote.channel.getConnectionState(),
  };
}

/**
 * Host side of `SyncManagerProxy`'s op channel: resolves one `sync-op` method
 * against a reactor's sync manager. The op strings and argument order are the
 * proxy's, so this is the one contract both Connect's worker and the monitor's
 * worker implement; it lives here as a function so it is unit-testable against a
 * fake sync manager over a `MessageChannel`-backed router.
 */
export async function dispatchSyncOp(
  syncManager: InspectableSyncManager,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case SYNC_OPS.list:
      return syncManager.list().map(toWireRemote);
    case SYNC_OPS.add: {
      const [name, collectionIdKey, channelConfig, filter, options] = args as [
        string,
        string,
        ChannelConfig,
        RemoteFilter | undefined,
        RemoteOptions | undefined,
      ];
      const remote = await syncManager.add(
        name,
        DriveCollectionId.fromKey(collectionIdKey),
        channelConfig,
        filter,
        options,
      );
      return toWireRemote(remote);
    }
    case SYNC_OPS.bindRemote:
      await syncManager.bindRemote(args[0] as string, args[1] as string);
      return undefined;
    case SYNC_OPS.setPeerManifest:
      await syncManager.setPeerManifest(
        args[0] as string,
        args[1] as PeerManifest | null,
      );
      return undefined;
    case SYNC_OPS.peerAgreementBasis:
      return syncManager.agreement().basis();
    case SYNC_OPS.listHolds:
      return syncManager.listHolds(
        args[0] as { remoteName?: string; documentId?: string } | undefined,
      );
    case SYNC_OPS.remove:
      await syncManager.remove(args[0] as string);
      return undefined;
    case SYNC_OPS.triggerPull:
      syncManager.triggerPull(args[0] as string);
      return undefined;
    case SYNC_OPS.inspectRemote:
      return syncManager.inspectRemote(args[0] as string);
    case SYNC_OPS.inspectRemotes:
      return syncManager.inspectRemotes();
    case SYNC_OPS.listDeadLetters:
      return syncManager.listDeadLetters(
        args[0] as string,
        args[1] as string | undefined,
        args[2] as number | undefined,
      );
    case SYNC_OPS.rewindInboxCursor:
      await syncManager.rewindInboxCursor(args[0] as string, args[1] as number);
      return undefined;
    case SYNC_OPS.resetChannel:
      await syncManager.resetChannel(args[0] as string);
      return undefined;
    case SYNC_OPS.requeueDeadLetter:
      await syncManager.requeueDeadLetter(args[0] as string, args[1] as string);
      return undefined;
    case SYNC_OPS.clearDeadLetter:
      await syncManager.clearDeadLetter(args[0] as string, args[1] as string);
      return undefined;
    default:
      throw new Error(`Unknown sync op: ${method}`);
  }
}
