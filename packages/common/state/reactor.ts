import {
  SynchronizationUnitNotFoundError,
  type SyncStatus,
} from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  loadableReactorAtom,
  selectedDriveAtom,
  setReactorAtom,
  unwrappedReactorAtom,
} from "./atoms.js";
import { useSyncDrivesAndDocumentsWithReactor } from "./syncing.js";
import { type Reactor, type SharingType } from "./types.js";
import { extractDriveFromPath } from "./utils.js";

export function useReactor() {
  return useAtomValue(loadableReactorAtom);
}

export function useUnwrappedReactor() {
  return useAtomValue(unwrappedReactorAtom);
}

export function useInitializeReactor(createReactor: () => Promise<Reactor>) {
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setReactor = useSetAtom(setReactorAtom);
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
          const drive = drives.find((d) => d.slug === driveSlug);
          if (drive) {
            setSelectedDrive(drive.id);
          }
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
