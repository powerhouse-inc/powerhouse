import {
  createScopedPHStore,
  getPHStore,
  PHStoreProvider,
  usePHStore,
} from "@powerhousedao/reactor-browser";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useDriveRouteIds } from "./route-data.js";

/** Gives `children` (a drive app, an editor) the selection of the route they
 * show: `useSelected*` read its drive and node, and opening goes through the app's router. */
export function RouteSelection({ children }: { children: ReactNode }) {
  const parent = usePHStore() ?? getPHStore();
  const ids = useDriveRouteIds();
  const driveId = ids?.driveId;
  const nodeId = ids?.nodeId;
  const store = useMemo(
    () =>
      parent &&
      createScopedPHStore(parent, {
        selectedDriveId: driveId,
        selectedNodeId: nodeId,
        navigation: parent.navigation,
      }),
    [parent, driveId, nodeId],
  );
  if (!store) return children;
  return <PHStoreProvider store={store}>{children}</PHStoreProvider>;
}
