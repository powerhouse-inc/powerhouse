import {
  DriveCollectionId,
  type MessagePortLike,
  type RemoteFilter,
} from "@powerhousedao/reactor";
import type { ManagedReactor } from "../types.js";
import {
  assertCollectionIdParts,
  DEFAULT_LOCAL_FILTER,
} from "./adopt-sync-peer.js";

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

/**
 * The collection to link, with its parts checked against what the collection-id
 * key format can carry. A dotted drive id would reach the far side as a
 * different collection; see `assertCollectionIdParts`.
 */
function resolveCollectionId(options: LinkLocalSyncOptions): DriveCollectionId {
  if (options.collectionId) {
    assertCollectionIdParts(
      options.collectionId.driveId,
      options.collectionId.branch,
    );
    return options.collectionId;
  }
  if (options.driveId) {
    const branch = options.branch ?? "main";
    assertCollectionIdParts(options.driveId, branch);
    return DriveCollectionId.forDrive(options.driveId, branch);
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
 * Refuses a link whose remote this reactor is already known to hold.
 *
 * Only a pre-check, and deliberately so: the authoritative one runs inside the
 * adopting realm (`registerLocalPeer`, which sees that realm's registry), and a
 * worker-hosted reactor answers `list()` from a cached snapshot this side. Its
 * job is to turn the common double-click into a sentence before any port is
 * opened; correctness does not rest on it.
 */
function refuseIfAlreadyLinked(
  reactor: ManagedReactor,
  remoteName: string,
): void {
  const known = reactor.syncManager?.list() ?? [];
  if (known.some((remote) => remote.meta.name === remoteName)) {
    throw new Error(
      `Reactor "${reactor.name}" already has a local sync remote named '${remoteName}'; unlink it before linking again`,
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
 *
 * All or nothing. Every precondition is checked before the channel is opened,
 * and if `b` refuses after `a` has accepted, `a`'s remote is removed, both
 * ports are closed and the original failure is rethrown -- a half link is worse
 * than no link, because one side would push into a port no one reads.
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

  refuseIfAlreadyLinked(a, remoteNameA);
  refuseIfAlreadyLinked(b, remoteNameB);

  const { port1, port2 } = (options.createChannel ?? defaultCreateChannel)();

  // Each side keys its port under the OTHER reactor's name, matching the
  // peerId its remote's ChannelConfig names.
  try {
    await a.adoptLocalSyncPeer!({
      peerId: b.name,
      channelName,
      collectionId,
      remoteName: remoteNameA,
      filter,
      port: port1,
    });
  } catch (error) {
    closeBoth(port1, port2);
    throw error;
  }

  try {
    await b.adoptLocalSyncPeer!({
      peerId: a.name,
      channelName,
      collectionId,
      remoteName: remoteNameB,
      filter,
      port: port2,
    });
  } catch (error) {
    await rollbackAdoptedSide(a, remoteNameA, b.name, channelName);
    closeBoth(port1, port2);
    throw error;
  }

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

/**
 * Closes both brokered ports. `close()` is idempotent on every port kind in
 * play, so this is safe over a port the adopting realm already closed -- and a
 * transferred port is no longer this realm's to close, which is why the worker
 * host closes its own end on every error path.
 */
function closeBoth(port1: MessagePortLike, port2: MessagePortLike): void {
  try {
    port1.close();
  } catch {
    // A transferred port is not ours to close; the far realm owns it.
  }
  try {
    port2.close();
  } catch {
    // Same.
  }
}

/**
 * Undoes the side that accepted, so a failed link leaves no remote behind.
 *
 * The rollback failure is swallowed deliberately: the caller must see why the
 * LINK failed, not why cleaning up after it did. It is logged instead.
 */
async function rollbackAdoptedSide(
  reactor: ManagedReactor,
  remoteName: string,
  peerId: string,
  channelName: string,
): Promise<void> {
  try {
    await reactor.removeLocalSyncPeer!(remoteName, peerId, channelName);
  } catch (error) {
    console.error(
      `[reactor-monitor] rolling back the local sync remote '${remoteName}' on "${reactor.name}" failed:`,
      error,
    );
  }
}
