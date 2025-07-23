import { childLogger } from "document-drive";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { setSelectedNodeAtom } from "./atoms.js";
import { useRefreshDocuments } from "./documents.js";
import {
  useRefreshDrives,
  useSetSelectedDrive,
  useUnwrappedSelectedDrive,
} from "./drives.js";
import { type Reactor } from "./types.js";
import { setSelectedDriveAndNodeFromUrl } from "./utils.js";

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
  shouldNavigate = true,
) {
  const selectedDrive = useUnwrappedSelectedDrive();
  const setSelectedDrive = useSetSelectedDrive();
  const setSelectedNode = useSetAtom(setSelectedNodeAtom);

  useEffect(() => {
    // If the reactor is already initialized, do nothing.
    if (window.reactor) return;

    async function initializeReactor() {
      // Create the reactor instance.
      const reactor = await createReactor();
      window.reactor = reactor;

      // Set the selected drive and node from the URL if `shouldNavigate` is true.
      const driveId = await setSelectedDriveAndNodeFromUrl(
        reactor,
        setSelectedDrive,
        setSelectedNode,
        shouldNavigate,
      );
    }

    initializeReactor().catch(logger.error);
  }, [
    shouldNavigate,
    selectedDrive,
    createReactor,
    setSelectedDrive,
    setSelectedNode,
  ]);
}

export function useSubscribeToReactorEvents() {
  const unwrappedSelectedDrive = useUnwrappedSelectedDrive();
  const driveId = unwrappedSelectedDrive?.header.id;
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();
  const reactor = useUnwrappedReactor();

  useEffect(() => {
    if (!reactor) return;
    reactor.on("syncStatus", (event, status, error) => {
      console.log("syncStatus", event, status, error);
      logger.verbose("syncStatus", event, status, error);
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("strandUpdate", () => {
      console.log("strandUpdate");
      logger.verbose("strandUpdate");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("defaultRemoteDrive", () => {
      console.log("defaultRemoteDrive");
      logger.verbose("defaultRemoteDrive");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("clientStrandsError", () => {
      console.log("clientStrandsError");
      logger.verbose("clientStrandsError");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("driveAdded", () => {
      console.log("driveAdded");
      logger.verbose("driveAdded");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("driveDeleted", () => {
      console.log("driveDeleted");
      logger.verbose("driveDeleted");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("documentModelModules", () => {
      console.log("documentModelModules");
      logger.verbose("documentModelModules");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("documentOperationsAdded", () => {
      console.log("documentOperationsAdded");
      logger.verbose("documentOperationsAdded");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("driveOperationsAdded", () => {
      console.log("driveOperationsAdded");
      logger.verbose("driveOperationsAdded");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
    reactor.on("operationsAdded", () => {
      console.log("operationsAdded");
      logger.verbose("operationsAdded");
      refreshDrives(reactor);
      refreshDocuments(reactor, driveId);
    });
  }, [driveId, refreshDrives, refreshDocuments, reactor]);
}
