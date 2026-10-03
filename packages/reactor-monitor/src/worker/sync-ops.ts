import {
  DriveCollectionId,
  type ChannelConfig,
  type ISyncManager,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
} from "@powerhousedao/reactor";
import type { PeerManifest } from "@powerhousedao/shared/document-model";

/**
 * Cloneable projection of a `Remote`: its meta (which carries the channel
 * config) plus a connection snapshot. The live `IChannel` cannot cross
 * `postMessage`, and `SyncManagerProxy` rehydrates exactly this shape.
 */
export function toWireRemote(remote: Remote): {
  meta: Remote["meta"];
  connectionState: ReturnType<Remote["channel"]["getConnectionState"]>;
} {
  return {
    meta: remote.meta,
    connectionState: remote.channel.getConnectionState(),
  };
}

/**
 * The worker side of `SyncManagerProxy`'s op channel.
 *
 * The op strings and argument order are the proxy's, so this is the same
 * contract Connect's worker implements; it lives here as a function rather
 * than inline in a host so it can be unit-tested against a fake sync manager.
 */
export async function dispatchSyncOp(
  syncManager: ISyncManager,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case "list":
      return syncManager.list().map(toWireRemote);
    case "add": {
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
    case "bindRemote":
      await syncManager.bindRemote(args[0] as string, args[1] as string);
      return undefined;
    case "setPeerManifest":
      await syncManager.setPeerManifest(
        args[0] as string,
        args[1] as PeerManifest | null,
      );
      return undefined;
    case "peerAgreementBasis":
      return syncManager.agreement().basis();
    case "listHolds":
      return syncManager.listHolds(
        args[0] as { remoteName?: string; documentId?: string } | undefined,
      );
    case "remove":
      await syncManager.remove(args[0] as string);
      return undefined;
    case "triggerPull":
      syncManager.triggerPull(args[0] as string);
      return undefined;
    default:
      throw new Error(`Unknown sync op: ${method}`);
  }
}
