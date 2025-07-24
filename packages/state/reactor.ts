import { childLogger } from "document-drive";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { selectedDriveAtom, setSelectedNodeAtom } from "./atoms.js";
import { useRefreshDocuments } from "./documents.js";
import {
  useRefreshDrives,
  useSelectedDriveId,
  useSetDrives,
  useUnwrappedSelectedDrive,
} from "./drives.js";
import {
  handleSetDriveEvent,
  handleSetNodeEvent,
  type SetDriveEvent,
  type SetNodeEvent,
} from "./events.js";
import { type Reactor } from "./types.js";

const logger = childLogger(["state", "reactor"]);

/** Returns the unwrapped reactor. */
export function useUnwrappedReactor() {
  if (typeof window === "undefined") return;
  return window.reactor;
}

/** Initializes the reactor.
 *
 * Creates the reactor and sets the selected drive and node from the URL if `shouldNavigate` is true.
 * Subscribes to the reactor's events and refreshes the drives and documents when they change.
 *
 * If the reactor is already initialized, does nothing.
 */
export function useInitializeReactor(
  createReactor: () => Promise<Reactor> | Reactor | undefined,
) {
  const setDrives = useSetDrives();
  useEffect(() => {
    // If the reactor is already initialized, do nothing.
    if (window.reactor) return;

    async function initializeReactor() {
      // Create the reactor instance.
      const reactor = await createReactor();
      window.reactor = reactor;
      // Initialize the drives.
      if (!reactor) return;
      const driveIds = await reactor.getDrives();
      const drives = await Promise.all(
        driveIds.map((driveId) => reactor.getDrive(driveId)),
      );
      setDrives(drives);
    }
    initializeReactor().catch(logger.error);
  }, [createReactor]);
}

export function useSubscribeToWindowEvents() {
  const selectedDriveId = useSelectedDriveId();
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(setSelectedNodeAtom);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSetDrive = (event: SetDriveEvent) => {
      handleSetDriveEvent(event, setSelectedDrive);
    };
    const handleSetNode = (event: SetNodeEvent) => {
      handleSetNodeEvent(event, selectedDriveId, setSelectedNode);
    };
    window.addEventListener("ph:setDrive", handleSetDrive);
    window.addEventListener("ph:setNode", handleSetNode);
    return () => {
      window.removeEventListener("ph:setDrive", handleSetDrive);
      window.removeEventListener("ph:setNode", handleSetNode);
    };
  }, [selectedDriveId, setSelectedDrive, setSelectedNode]);
}

export function useSubscribeToReactorEvents() {
  const unwrappedSelectedDrive = useUnwrappedSelectedDrive();
  const driveId = unwrappedSelectedDrive?.header.id;
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();
  const reactor = useUnwrappedReactor();

  useEffect(() => {
    if (!reactor) return;
    const unsubs = [
      reactor.on("syncStatus", (...args) => {
        logger.verbose("syncStatus", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("strandUpdate", (...args) => {
        logger.verbose("strandUpdate", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("defaultRemoteDrive", (...args) => {
        logger.verbose("defaultRemoteDrive", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("clientStrandsError", (...args) => {
        logger.verbose("clientStrandsError", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("driveAdded", (...args) => {
        logger.verbose("driveAdded", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("driveDeleted", (...args) => {
        logger.verbose("driveDeleted", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("documentModelModules", (...args) => {
        logger.verbose("documentModelModules", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("documentOperationsAdded", (...args) => {
        logger.verbose("documentOperationsAdded", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("driveOperationsAdded", (...args) => {
        logger.verbose("driveOperationsAdded", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
      reactor.on("operationsAdded", (...args) => {
        logger.verbose("operationsAdded", ...args);
        refreshDrives(reactor);
        refreshDocuments(reactor, driveId);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [driveId, refreshDrives, refreshDocuments, reactor]);
}
