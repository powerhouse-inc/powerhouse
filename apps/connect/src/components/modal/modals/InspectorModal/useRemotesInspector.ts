import { useSync } from "@powerhousedao/reactor-browser/connect";
import { useCallback } from "react";

export function useRemotesInspector() {
  const syncManager = useSync();
  if (!syncManager) {
    throw new Error("Sync manager not found");
  }

  const getRemotes = useCallback(() => {
    return Promise.resolve(syncManager.list());
  }, [syncManager]);

  return {
    getRemotes,
  };
}
