import {
  SynchronizationUnitNotFoundError,
  type SyncStatus,
} from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  initializeReactorAtom,
  loadableReactorAtom,
  selectedDriveAtom,
  setSelectedNodeAtom,
  unwrappedReactorAtom,
} from "./atoms.js";
import { useSyncDrivesAndDocumentsWithReactor } from "./syncing.js";
import { type Reactor, type SharingType } from "./types.js";
import {
  extractDriveFromPath,
  extractNodeNameOrSlugOrIdFromPath,
  makeNodeSlugFromNodeName,
} from "./utils.js";

export function useReactor() {
  return useAtomValue(loadableReactorAtom);
}

export function useUnwrappedReactor() {
  return useAtomValue(unwrappedReactorAtom);
}

export function useInitializeReactor(createReactor: () => Promise<Reactor>) {
  const setReactor = useSetAtom(initializeReactorAtom);
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(setSelectedNodeAtom);
  const refresh = useSyncDrivesAndDocumentsWithReactor();

  useEffect(() => {
    async function initializeReactor() {
      const reactor = await createReactor();

      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const driveSlug = extractDriveFromPath(path);
        if (driveSlug) {
          const driveIds = await reactor.getDrives();
          const drives = await Promise.all(
            driveIds.map((id) => reactor.getDrive(id)),
          );
          const drive = drives.find(
            (d) => d.header.slug === driveSlug || d.header.id === driveSlug,
          );
          setSelectedDrive(drive?.header.id);
          const nodeIdOrSlugOrNameFromPath =
            extractNodeNameOrSlugOrIdFromPath(path);
          const nodes = drive?.state.global.nodes;
          const node = nodes?.find(
            (n) =>
              n.id === nodeIdOrSlugOrNameFromPath ||
              makeNodeSlugFromNodeName(n.name) === nodeIdOrSlugOrNameFromPath,
          );
          setSelectedNode(node?.id);
        }
      }

      reactor.on("syncStatus", (event, status, error) => {
        console.log("syncStatus", event, status, error);
        refresh();
      });
      reactor.on("strandUpdate", () => {
        console.log("strandUpdate");
        refresh();
      });
      reactor.on("defaultRemoteDrive", () => {
        console.log("defaultRemoteDrive");
        refresh();
      });
      setReactor(reactor);
    }

    initializeReactor().catch(console.error);
  }, [setReactor, createReactor, refresh]);
}

export function useGetSyncStatusSync() {
  const reactor = useUnwrappedReactor();

  const getSyncStatusSync = useCallback(
    (syncId: string, sharingType: SharingType): SyncStatus | undefined => {
      if (sharingType === "LOCAL") return;
      if (!reactor) {
        return "INITIAL_SYNC";
      }
      try {
        const syncStatus = reactor.getSyncStatus(syncId);
        if (syncStatus instanceof SynchronizationUnitNotFoundError)
          return "INITIAL_SYNC";
        return syncStatus;
      } catch (error) {
        console.error(error);
        return "ERROR";
      }
    },
    [reactor],
  );

  return getSyncStatusSync;
}
