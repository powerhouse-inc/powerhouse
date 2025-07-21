import {
  childLogger,
  SynchronizationUnitNotFoundError,
  type SyncStatus,
} from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  initializeDocumentsAtom,
  initializeDrivesAtom,
  initializeReactorAtom,
  loadableReactorAtom,
  selectedDriveAtom,
  setSelectedNodeAtom,
  unwrappedReactorAtom,
} from "./atoms.js";
import { useSyncDrivesAndDocumentsWithReactor } from "./syncing.js";
import { type Reactor, type SharingType } from "./types.js";
import { setSelectedDriveAndNodeFromUrl } from "./utils.js";

const logger = childLogger(["state", "reactor"]);

/** Returns a loadable of the reactor. */
export function useReactor() {
  return useAtomValue(loadableReactorAtom);
}

/** Returns the unwrapped reactor. */
export function useUnwrappedReactor() {
  return useAtomValue(unwrappedReactorAtom);
}

/** Initializes the reactor.
 *
 * Creates the reactor and sets the selected drive and node from the URL if `shouldNavigate` is true.
 * Subscribes to the reactor's events and refreshes the drives and documents when they change.
 *
 * If the reactor is already initialized, does nothing.
 */
export function useInitializeReactor(
  createReactor: () => Promise<Reactor>,
  shouldNavigate = true,
) {
  const unwrappedReactor = useUnwrappedReactor();
  const setReactor = useSetAtom(initializeReactorAtom);
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(setSelectedNodeAtom);
  const initializeDrives = useSetAtom(initializeDrivesAtom);
  const initializeDocuments = useSetAtom(initializeDocumentsAtom);
  const refresh = useSyncDrivesAndDocumentsWithReactor();

  useEffect(() => {
    // If the reactor is already initialized, do nothing.
    if (unwrappedReactor) return;

    async function initializeReactor() {
      // Create the reactor instance.
      const reactor = await createReactor();
      const driveIds = await reactor.getDrives();
      const drives = await Promise.all(
        (driveIds ?? []).map((driveId) => reactor.getDrive(driveId)),
      );
      initializeDrives(drives);

      // Subscribe to the reactor's events.
      reactor.on("syncStatus", (event, status, error) => {
        logger.verbose("syncStatus", event, status, error);
        refresh();
      });
      reactor.on("strandUpdate", () => {
        logger.verbose("strandUpdate");
        refresh();
      });
      reactor.on("defaultRemoteDrive", () => {
        logger.verbose("defaultRemoteDrive");
        refresh();
      });
      reactor.on("clientStrandsError", () => {
        logger.verbose("clientStrandsError");
        refresh();
      });
      reactor.on("driveAdded", () => {
        logger.verbose("driveAdded");
        refresh();
      });
      reactor.on("driveDeleted", () => {
        logger.verbose("driveDeleted");
        refresh();
      });
      reactor.on("documentModelModules", () => {
        logger.verbose("documentModelModules");
        refresh();
      });
      reactor.on("documentOperationsAdded", () => {
        logger.verbose("documentOperationsAdded");
        refresh();
      });
      reactor.on("driveOperationsAdded", () => {
        logger.verbose("driveOperationsAdded");
        refresh();
      });
      reactor.on("operationsAdded", () => {
        logger.verbose("operationsAdded");
        refresh();
      });

      // Set the reactor instance atom.
      setReactor(reactor);

      // Set the selected drive and node from the URL if `shouldNavigate` is true.
      const driveId = await setSelectedDriveAndNodeFromUrl(
        reactor,
        setSelectedDrive,
        setSelectedNode,
        shouldNavigate,
      );
      if (driveId) {
        const documentIds = await reactor.getDocuments(driveId);
        const documents = await Promise.all(
          (documentIds ?? []).map((id) => reactor.getDocument(driveId, id)),
        );
        initializeDocuments(documents.filter((d) => d !== undefined));
      }
    }

    initializeReactor().catch(logger.error);
  }, [setReactor, createReactor, refresh, shouldNavigate]);
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
        logger.error(error);
        return "ERROR";
      }
    },
    [reactor],
  );

  return getSyncStatusSync;
}
