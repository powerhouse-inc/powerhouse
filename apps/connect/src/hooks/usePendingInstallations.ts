import {
  usePackageDiscoveryService,
  type PendingInstallation,
} from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

const emptyArray: PendingInstallation[] = [];

export function usePendingInstallations() {
  const discoveryService = usePackageDiscoveryService();
  return useSyncExternalStore(
    (cb) => discoveryService?.subscribePending(cb) ?? (() => {}),
    () => discoveryService?.getPendingInstallations() ?? emptyArray,
  );
}
