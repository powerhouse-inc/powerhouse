import type { Remote } from "@powerhousedao/reactor";
import { useSync } from "@powerhousedao/reactor-browser/connect";
import { useCallback } from "react";

export function useRemotesInspector(): {
  getRemotes: () => Promise<Remote[]>;
  removeRemote: (name: string) => Promise<void>;
} {
  const syncManager = useSync();
  if (!syncManager) {
    throw new Error("Sync manager not found");
  }

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
  };
}
