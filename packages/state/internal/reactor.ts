import { logger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useSelectedDriveId } from "../hooks/drives.js";
import { useReactor } from "../hooks/reactor.js";
import {
  documentsInitializedAtom,
  driveIdInitializedAtom,
  drivesInitializedAtom,
  selectedDriveAtom,
  selectedNodeAtom,
} from "./atoms.js";
import { useRefreshDocuments, useSetDocuments } from "./documents.js";
import { useRefreshDrives, useSetDrives } from "./drives.js";
import {
  handleSetDriveEvent,
  handleSetNodeEvent,
  type SetDriveEvent,
  type SetNodeEvent,
} from "./events.js";
import { type Reactor } from "./types.js";

/** Initializes the reactor.
 *
 * Creates the reactor and sets the selected drive and node from the URL.
 */
export function useInitializeReactor(
  createReactor?: () => Promise<Reactor> | undefined,
) {
  const [reactorInitialized, setReactorInitialized] = useState(
    !!window.reactor,
  );
  const drivesInitialized = useAtomValue(drivesInitializedAtom);
  const selectedDriveIdInitialized = useAtomValue(driveIdInitializedAtom);
  const selectedDriveId = useSelectedDriveId();
  const documentsInitialized = useAtomValue(documentsInitializedAtom);
  const setDrives = useSetDrives();
  const setDocuments = useSetDocuments();

  useEffect(() => {
    // If the reactor is already initialized, do nothing.
    if (reactorInitialized) return;
    async function initializeReactor() {
      // Create the reactor instance.
      const initializedReactor = await createReactor?.();
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
  const setSelectedDrive = useSetAtom(selectedDriveAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);

  const handleSetDrive = useCallback(
    (event: SetDriveEvent) => {
      handleSetDriveEvent(event, setSelectedDrive);
    },
    [setSelectedDrive],
  );

  const handleSetNode = useCallback(
    (event: SetNodeEvent) => {
      handleSetNodeEvent(event, setSelectedNode);
    },
    [setSelectedNode],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("ph:setDrive", handleSetDrive);

    return () => {
      window.removeEventListener("ph:setDrive", handleSetDrive);
    };
  }, [handleSetDrive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("ph:setNode", handleSetNode);

    return () => {
      window.removeEventListener("ph:setNode", handleSetNode);
    };
  }, [handleSetNode]);
}

export function useSubscribeToReactorEvents() {
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();
  const reactor = useReactor();

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
