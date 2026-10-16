import { SyncEventTypes } from "@powerhousedao/reactor";
import type { PHStore } from "../hooks/ph-store.js";
import { subscribePHStore } from "../hooks/ph-store.js";
import { SYNC_REMOTES_CHANGED_EVENT } from "../rpc/bus-event-ids.js";
import { isInitialSyncInFlight, listSyncRemotes } from "./initial-sync.js";

/** Drives that may still arrive, e.g. while the first sync runs. */
export type DriveArrivals = {
  isPending(): boolean;
  /** Whether more of `driveId`'s content may arrive: its remote's first sync. */
  isDrivePending(driveId: string): boolean;
  /** Calls `listener` whenever the drives or `isPending()` may have changed. */
  subscribe(listener: () => void): () => void;
};

let pendingAdds = 0;
const addListeners = new Set<() => void>();

function notifyAdds() {
  for (const listener of [...addListeners]) listener();
}

/** Counts a background drive addition as pending until it settles. */
export function trackDriveArrival<T>(promise: Promise<T>): Promise<T> {
  pendingAdds++;
  notifyAdds();
  return promise.finally(() => {
    pendingAdds--;
    notifyAdds();
  });
}

/** Resolves once `store.drives` lists `driveId`, or after `maxWaitMs`: a
 * finished first pull does not mean the drive is listed yet. */
export function untilDriveListed(
  store: PHStore,
  driveId: string,
  maxWaitMs = 15_000,
): Promise<void> {
  const listed = () => !!store.drives?.some((d) => d.header.id === driveId);
  if (listed()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(finish, maxWaitMs);
    const unsubscribe = subscribePHStore(
      store,
      () => {
        if (listed()) finish();
      },
      "drives",
    );
  });
}

// Remote list changes: any remote's state change, and the worker's list updates.
const REMOTE_EVENTS = [
  SyncEventTypes.CONNECTION_STATE_CHANGED,
  SYNC_REMOTES_CHANGED_EVENT,
];

/** Drives still on their way into `store`: being added or first syncing. */
export function createDriveArrivals(store: PHStore): DriveArrivals {
  return {
    // Undefined drives: the reactor has not listed them yet.
    isPending: () =>
      store.drives === undefined ||
      pendingAdds > 0 ||
      isInitialSyncInFlight(store),
    isDrivePending: (driveId) => isInitialSyncInFlight(store, driveId),
    subscribe(listener) {
      // Each listed remote's channel; remotes come and go, so this is refreshed.
      const watched = new Map<object, () => void>();
      const listenToRemotes = () => {
        const channels = new Set<object>();
        for (const { channel } of listSyncRemotes(store)) {
          channels.add(channel);
          if (watched.has(channel)) continue;
          try {
            watched.set(channel, channel.onConnectionStateChange(listener));
          } catch {
            watched.set(channel, () => {});
          }
        }
        for (const [channel, unsubscribe] of watched) {
          if (channels.has(channel)) continue;
          unsubscribe();
          watched.delete(channel);
        }
      };
      const onChange = () => {
        listenToRemotes();
        listener();
      };

      let unsubscribeBus: Array<() => void> = [];
      const listenToBus = () => {
        for (const unsubscribe of unsubscribeBus) unsubscribe();
        const bus = store.reactorClientModule?.reactorModule?.eventBus;
        unsubscribeBus = bus
          ? REMOTE_EVENTS.map((type) => bus.subscribe(type, onChange))
          : [];
      };
      const onModuleChange = () => {
        listenToBus();
        onChange();
      };

      listenToRemotes();
      listenToBus();
      addListeners.add(onChange);
      const unsubscribes = [
        subscribePHStore(store, onChange, "drives"),
        subscribePHStore(store, onModuleChange, "reactorClientModule"),
      ];
      return () => {
        addListeners.delete(onChange);
        for (const unsubscribe of unsubscribes) unsubscribe();
        for (const unsubscribe of unsubscribeBus) unsubscribe();
        for (const unsubscribe of watched.values()) unsubscribe();
        watched.clear();
      };
    },
  };
}
