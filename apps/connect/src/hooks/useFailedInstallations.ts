import {
  usePackageDiscoveryService,
  type FailedInstallation,
} from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

const emptyArray: FailedInstallation[] = [];

export function useFailedInstallations() {
  const discoveryService = usePackageDiscoveryService();
  return useSyncExternalStore(
    (cb) => discoveryService?.subscribeFailed(cb) ?? (() => {}),
    () => discoveryService?.getFailedInstallations() ?? emptyArray,
  );
}
