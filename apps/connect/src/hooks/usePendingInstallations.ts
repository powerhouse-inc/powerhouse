import {
  usePackageDiscoveryService,
  type PendingInstallation,
} from "@powerhousedao/reactor-browser";
import { useCallback, useRef, useSyncExternalStore } from "react";

const emptyArray: readonly PendingInstallation[] = [];

export function usePendingInstallations() {
  const discoveryService = usePackageDiscoveryService();
  const cacheRef = useRef<readonly PendingInstallation[]>(emptyArray);

  const getSnapshot = useCallback(() => {
    if (!discoveryService) return emptyArray;
    const next = discoveryService.getPendingInstallations() ?? emptyArray;
    const prev = cacheRef.current;
    if (
      next === prev ||
      (next.length === prev.length && next.every((p, i) => p === prev[i]))
    ) {
      return prev;
    }
    cacheRef.current = next;
    return next;
  }, [discoveryService]);

  return useSyncExternalStore(
    (cb) => discoveryService?.subscribePending(cb) ?? (() => {}),
    getSnapshot,
  );
}
