import type { ConnectionStateSnapshot } from "@powerhousedao/reactor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSync } from "./reactor.js";

/**
 * Returns a map of remote name to connection state snapshot for all remotes.
 * Re-renders when any remote's connection state changes.
 */
export function useConnectionStates(): ReadonlyMap<
  string,
  ConnectionStateSnapshot
> {
  const syncManager = useSync();
  const [states, setStates] = useState<
    ReadonlyMap<string, ConnectionStateSnapshot>
  >(() => buildSnapshot(syncManager));
  const unsubscribesRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!syncManager) return;

    function subscribe() {
      // Clean up previous subscriptions
      for (const unsub of unsubscribesRef.current) {
        unsub();
      }
      unsubscribesRef.current = [];

      const remotes = syncManager!.list();
      for (const remote of remotes) {
        const unsub = remote.channel.onConnectionStateChange(() => {
          setStates(buildSnapshot(syncManager));
        });
        unsubscribesRef.current.push(unsub);
      }

      // Set initial state
      setStates(buildSnapshot(syncManager));
    }

    subscribe();

    // Re-subscribe periodically to pick up added/removed remotes
    const interval = setInterval(subscribe, 5000);

    return () => {
      clearInterval(interval);
      for (const unsub of unsubscribesRef.current) {
        unsub();
      }
      unsubscribesRef.current = [];
    };
  }, [syncManager]);

  return states;
}

/**
 * Returns the connection state snapshot for a specific remote by name.
 */
export function useConnectionState(
  remoteName: string,
): ConnectionStateSnapshot | undefined {
  const states = useConnectionStates();
  return states.get(remoteName);
}

function buildSnapshot(
  syncManager: ReturnType<typeof useSync>,
): ReadonlyMap<string, ConnectionStateSnapshot> {
  const map = new Map<string, ConnectionStateSnapshot>();
  if (!syncManager) return map;
  for (const remote of syncManager.list()) {
    map.set(remote.name, remote.channel.getConnectionState());
  }
  return map;
}
