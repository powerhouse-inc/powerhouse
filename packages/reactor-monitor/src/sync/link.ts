import {
  DriveCollectionId,
  type MessagePortLike,
  type RemoteFilter,
} from "@powerhousedao/reactor";
import type { ManagedReactor } from "../types.js";
import { DEFAULT_LOCAL_FILTER } from "./adopt-sync-peer.js";

/** A live local-sync link between two reactors, and the lever that tears it down. */
export type LocalSyncHandle = {
  readonly reactorA: string;
  readonly reactorB: string;
  readonly channelName: string;
  readonly collectionId: DriveCollectionId;
  readonly remoteNameA: string;
  readonly remoteNameB: string;
  /** Removes both remotes (closing both ports) and forgets both registrations. */
  unlink: () => Promise<void>;
};

export type LinkLocalSyncOptions = {
  /** The collection to sync; supply this or {@link driveId}. */
  collectionId?: DriveCollectionId;
  /** Drive id, when not passing a {@link collectionId} directly. */
  driveId?: string;
  /** Branch for the derived collection id; defaults to `"main"`. */
  branch?: string;
  /** Operation filter for both remotes; defaults to the whole collection. */
  filter?: RemoteFilter;
  /** Channel label both sides key the brokered port under; derived when absent. */
  channelName?: string;
  /**
   * Opens the broker's channel. Defaults to the global `MessageChannel`, which
   * is what a browser uses. A Node test injects a `node:worker_threads`
   * `MessageChannel` so there is no browser dependency.
   */
  createChannel?: () => { port1: MessagePortLike; port2: MessagePortLike };
};

function defaultCreateChannel(): {
  port1: MessagePortLike;
  port2: MessagePortLike;
} {
  const channel = new MessageChannel();
  return {
    port1: channel.port1 as unknown as MessagePortLike,
    port2: channel.port2 as unknown as MessagePortLike,
  };
}

function resolveCollectionId(options: LinkLocalSyncOptions): DriveCollectionId {
  if (options.collectionId) {
    return options.collectionId;
  }
  if (options.driveId) {
    return DriveCollectionId.forDrive(
      options.driveId,
      options.branch ?? "main",
    );
  }
  throw new Error(
    "linkLocalSync requires either a collectionId or a driveId to sync",
  );
}

function requireLocalCapable(reactor: ManagedReactor): void {
  if (!reactor.adoptLocalSyncPeer || !reactor.removeLocalSyncPeer) {
    throw new Error(
      `Reactor "${reactor.name}" was not provisioned with local sync (sync.local); it cannot adopt a brokered local peer`,
    );
  }
}

/**
 * Wires a direct `LocalChannel` sync link between two monitor-owned reactors
 * for one collection -- no Switchboard, no GraphQL (multi-reactor W1.2).
 *
 * The monitor is the broker: it opens one `MessageChannel`, hands `a` port1 and
 * `b` port2 (transferred into a worker, wrapped in-process), and each reactor
 * registers its end under `(peer name, channelName)` and adds a local remote.
 * `LocalChannelFactory` then resolves the brokered port and the peer-to-peer
 * handshake runs over it, so ops created in `a` reach `b` and vice-versa.
 */
export async function linkLocalSync(
  a: ManagedReactor,
  b: ManagedReactor,
  options: LinkLocalSyncOptions,
): Promise<LocalSyncHandle> {
  if (a.name === b.name) {
    throw new Error("linkLocalSync requires two distinct reactors");
  }
  requireLocalCapable(a);
  requireLocalCapable(b);

  const collectionId = resolveCollectionId(options);
  const channelName = options.channelName ?? collectionId.key;
  const filter = options.filter ?? DEFAULT_LOCAL_FILTER;
  const remoteNameA = `local:${b.name}:${channelName}`;
  const remoteNameB = `local:${a.name}:${channelName}`;

  const { port1, port2 } = (options.createChannel ?? defaultCreateChannel)();

  // Each side keys its port under the OTHER reactor's name, matching the
  // peerId its remote's ChannelConfig names.
  await a.adoptLocalSyncPeer!({
    peerId: b.name,
    channelName,
    collectionId,
    remoteName: remoteNameA,
    filter,
    port: port1,
  });
  await b.adoptLocalSyncPeer!({
    peerId: a.name,
    channelName,
    collectionId,
    remoteName: remoteNameB,
    filter,
    port: port2,
  });

  return {
    reactorA: a.name,
    reactorB: b.name,
    channelName,
    collectionId,
    remoteNameA,
    remoteNameB,
    unlink: async () => {
      const results = await Promise.allSettled([
        a.removeLocalSyncPeer!(remoteNameA, b.name, channelName),
        b.removeLocalSyncPeer!(remoteNameB, a.name, channelName),
      ]);
      // Both sides are always attempted; surface the first failure, if any.
      for (const result of results) {
        if (result.status === "rejected") {
          throw result.reason;
        }
      }
    },
  };
}
