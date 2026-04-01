import { usePackageDiscoveryService } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

const emptyArray: [] = [];

export function usePendingInstallations() {
  const discoveryService = usePackageDiscoveryService();
  return useSyncExternalStore(
    (cb) => discoveryService?.subscribePending(cb) ?? (() => {}),
    () => discoveryService?.getPendingInstallations() ?? emptyArray,
  );
}
