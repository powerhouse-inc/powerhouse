import { childLogger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  documentsInitializedAtom,
  driveIdInitializedAtom,
  drivesInitializedAtom,
  selectedDriveAtom,
  selectedNodeAtom,
} from "./atoms.js";
import { useRefreshDocuments, useSetDocuments } from "./documents.js";
import {
  useRefreshDrives,
  useSelectedDriveId,
  useSetDrives,
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
  const [reactorInitialized, setReactorInitialized] = useState(false);
  const drivesInitialized = useAtomValue(drivesInitializedAtom);
  const setDrives = useSetDrives();
  const selectedDriveIdInitialized = useAtomValue(driveIdInitializedAtom);
  const selectedDriveId = useSelectedDriveId();
  const documentsInitialized = useAtomValue(documentsInitializedAtom);
  const setDocuments = useSetDocuments();

  useEffect(() => {
    // If the reactor is already initialized, do nothing.
    if (reactorInitialized) return;

    async function initializeReactor() {
      // Create the reactor instance.
      const initializedReactor = await createReactor();
      // Set the reactor instance in the window object.
      window.reactor = initializedReactor;
      setReactorInitialized(true);
    }
    initializeReactor().catch(logger.error);
  }, [createReactor, reactorInitialized]);

  useEffect(() => {
    // Wait for the reactor to be initialized.
    if (!reactorInitialized) return;
    // If the drives are already initialized, do nothing.
    if (drivesInitialized) return;

    async function initializeDrives() {
      await setDrives();
    }

    initializeDrives().catch(logger.error);
  }, [reactorInitialized, setDrives, drivesInitialized]);

  useEffect(() => {
    // Wait for the reactor to be initialized.
    if (!reactorInitialized) return;
    // If the selected drive id is not initialized, do nothing.
    if (!selectedDriveIdInitialized) return;
    // If the documents are already initialized, do nothing.
    if (documentsInitialized) return;

    async function initializeDocuments() {
      await setDocuments(selectedDriveId);
    }
    initializeDocuments().catch(logger.error);
  }, [
    reactorInitialized,
    documentsInitialized,
    selectedDriveIdInitialized,
    selectedDriveId,
    setDocuments,
  ]);
}

export function useSubscribeToWindowEvents() {
  const selectedDriveId = useSelectedDriveId();
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const setDocuments = useSetDocuments();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSetDrive = (event: SetDriveEvent) => {
      handleSetDriveEvent(event, setSelectedDrive, setDocuments);
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
  }, [selectedDriveId, setSelectedDrive, setSelectedNode, setDocuments]);
}

export function useSubscribeToReactorEvents() {
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();
  const reactor = useUnwrappedReactor();

  useEffect(() => {
    if (!reactor) return;
    const unsubs = [
      reactor.on("syncStatus", (...args) => {
        logger.verbose("syncStatus", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("strandUpdate", (...args) => {
        logger.verbose("strandUpdate", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("defaultRemoteDrive", (...args) => {
        logger.verbose("defaultRemoteDrive", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("clientStrandsError", (...args) => {
        logger.verbose("clientStrandsError", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("driveAdded", (...args) => {
        logger.verbose("driveAdded", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("driveDeleted", (...args) => {
        logger.verbose("driveDeleted", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("documentModelModules", (...args) => {
        logger.verbose("documentModelModules", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("documentOperationsAdded", (...args) => {
        logger.verbose("documentOperationsAdded", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("driveOperationsAdded", (...args) => {
        console.log("driveOperationsAdded", ...args);
        logger.verbose("driveOperationsAdded", ...args);
        refreshDrives();
        refreshDocuments();
      }),
      reactor.on("operationsAdded", (...args) => {
        console.log("operationsAdded", ...args);
        logger.verbose("operationsAdded", ...args);
        refreshDrives();
        refreshDocuments();
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [refreshDrives, refreshDocuments, reactor]);
}
