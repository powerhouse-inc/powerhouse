import type {
  ConnectionStateSnapshot,
  Remote,
} from "@powerhousedao/reactor-browser";
import { useConnectionStates, useSync } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";

export function useRemotesInspector(): {
  getRemotes: () => Promise<Remote[]>;
  removeRemote: (name: string) => Promise<void>;
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>;
} {
  const syncManager = useSync();
  if (!syncManager) {
    throw new Error("Sync manager not found");
  }

  const connectionStates = useConnectionStates();

  const getRemotes = useCallback(() => {
    return Promise.resolve(syncManager.list());
  }, [syncManager]);

  const removeRemote = useCallback(
    (name: string) => syncManager.remove(name),
    [syncManager],
  );

  return {
    getRemotes,
    removeRemote,
    connectionStates,
  };
}
