import { useSync } from "@powerhousedao/reactor-browser/connect";
import { useCallback } from "react";

export function useRemotesInspector() {
  const syncManager = useSync();

  const getRemotes = useCallback(() => {
    return Promise.resolve(syncManager?.list() ?? []);
  }, [syncManager]);

  return {
    getRemotes,
  };
}
