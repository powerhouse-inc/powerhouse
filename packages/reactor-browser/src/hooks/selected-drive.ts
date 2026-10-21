import { getPHStore } from "./ph-store.js";
import { useCallback } from "react";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  findDriveBySlug,
  makeDriveSlug,
} from "../utils/url.js";
import { isInitialSyncInFlight } from "../routing/initial-sync.js";
import { useDispatch } from "./dispatch.js";
import { useDriveContext } from "./drive-context.js";
import { useDrives } from "./drives.js";
import {
  makePHEventFunctions,
  subscribeToPHValue,
} from "./make-ph-event-functions.js";
import {
  getCurrentPathname,
  hasHostNavigation,
  openTarget,
  preloadTarget,
} from "./navigation.js";
import { selectNode } from "./set-selected-node.js";

const selectedDriveIdEventFunctions = makePHEventFunctions("selectedDriveId");
const useStoreSelectedDriveId = selectedDriveIdEventFunctions.useValue;

/** Returns the selected drive id: the drive app's drive, else the app's selection. */
export function useSelectedDriveId() {
  const context = useDriveContext();
  const selectedDriveId = useStoreSelectedDriveId();
  return context ? context.drive.header.id : selectedDriveId;
}

/** Sets the selected drive id */
export const setSelectedDriveId = selectedDriveIdEventFunctions.setValue;

/** Adds an event handler for the selected drive id
 * @deprecated `ph:setSelectedDriveId` bypasses the URL; use `setSelectedDrive`. */
export const addSelectedDriveIdEventHandler =
  selectedDriveIdEventFunctions.addEventHandler;

/** Returns the selected drive */
export function useSelectedDrive() {
  const drive = useSelectedDriveSafe();
  if (!drive[0]) {
    throw new Error(
      "There is no drive selected. Did you mean to call 'useSelectedDriveSafe'?",
    );
  }

  return drive;
}

/** Returns the selected drive, or undefined if no drive is selected */
export function useSelectedDriveSafe() {
  const context = useDriveContext();
  const selectedDriveId = useStoreSelectedDriveId();
  const drives = useDrives();
  const selectedDrive = context
    ? undefined
    : drives?.find((drive) => drive.header.id === selectedDriveId);

  const [drive, dispatch] = useDispatch(selectedDrive);
  if (context) {
    return [context.drive, context.dispatch] as [
      DocumentDriveDocument,
      DocumentDispatch<DocumentDriveAction>,
    ];
  }
  if (!selectedDrive) {
    return [undefined, undefined] as const;
  }
  return [drive, dispatch] as [
    DocumentDriveDocument,
    DocumentDispatch<DocumentDriveAction>,
  ];
}

type DriveRef = string | DocumentDriveDocument | undefined;

/** Selects a drive in the app's store. */
export function setSelectedDrive(driveOrDriveSlug: DriveRef) {
  selectDrive(driveOrDriveSlug);
}

/** `setSelectedDrive`, as a hook. */
export function useSetSelectedDrive() {
  return useCallback((drive: DriveRef) => selectDrive(drive), []);
}

/** Selects a drive in the app's store. */
export function selectDrive(driveOrDriveSlug: DriveRef) {
  const driveSlug =
    typeof driveOrDriveSlug === "string"
      ? driveOrDriveSlug
      : driveOrDriveSlug && makeDriveSlug(driveOrDriveSlug);

  // A host router resolves the drive and writes the selection itself.
  if (hasHostNavigation()) {
    cancelPendingDriveSelection();
    openTarget(driveSlug ? { driveSlug } : undefined);
    return;
  }

  // A full drive document is selected directly — a just-created drive
  // navigates before the collection refresh. Slugs go through the lookup.
  const drives = getPHStore()?.drives;
  const drive =
    typeof driveOrDriveSlug === "object" && driveOrDriveSlug !== null
      ? driveOrDriveSlug
      : findDriveBySlug(drives, driveSlug);
  const driveId = drive?.header.id;

  // Deprecated: hosts without a navigation only; route loaders wait for drives.
  // A deep link may predate remote drive registration, so defer the lookup.
  if (
    !driveId &&
    driveSlug &&
    extractDriveSlugFromPath(getCurrentPathname()) === driveSlug
  ) {
    // Clear the previous selection so a stale drive doesn't render against
    // the new URL; the selected node resets with it, the URL is untouched.
    if (getPHStore()?.selectedDriveId) {
      setSelectedDriveId(undefined);
    }
    deferDriveSelection(driveSlug);
    return;
  }

  // Any resolved selection supersedes a pending deferred lookup.
  cancelPendingDriveSelection();

  setSelectedDriveId(driveId);
  openTarget(driveId && driveSlug ? { driveSlug } : undefined);
}

/** Warms a drive's view before it is opened, e.g. on hover. */
export function preloadDrive(drive: DocumentDriveDocument | undefined) {
  if (drive) preloadTarget({ driveSlug: makeDriveSlug(drive) });
}

/** `preloadDrive`, as a hook. */
export function usePreloadDrive() {
  return useCallback(
    (drive: DocumentDriveDocument | undefined) => preloadDrive(drive),
    [],
  );
}

// Tick between unresolved-slug checks; re-armed while a sync is in flight.
const DEFERRED_DRIVE_TICK_MS = 2_000;
// Hard cap so a wedged remote can't pin the deep link forever.
const DEFERRED_DRIVE_MAX_WAIT_MS = 15_000;

let unsubscribePending: (() => void) | undefined;
let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

function cancelPendingDriveSelection() {
  if (unsubscribePending) {
    unsubscribePending();
    unsubscribePending = undefined;
  }
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = undefined;
  }
}

// Deprecated with the no-navigation path: re-runs the slug lookup on drives
// updates, restores the pinned node, and redirects home once syncs settle.
function deferDriveSelection(driveSlug: string) {
  cancelPendingDriveSelection();

  // Capture the node pinned in the deep link before setSelectedDrive
  // rewrites the URL to /d/<driveSlug>, dropping the node segment.
  const nodeSlug = extractNodeSlugFromPath(getCurrentPathname());
  const handler = () => {
    const drive = findDriveBySlug(getPHStore()?.drives, driveSlug);
    if (!drive) {
      return;
    }
    cancelPendingDriveSelection();
    selectDrive(driveSlug);
    selectNode(nodeSlug);
  };
  unsubscribePending = subscribeToPHValue("drives", handler);

  const deadline = Date.now() + DEFERRED_DRIVE_MAX_WAIT_MS;
  const scheduleTick = () => {
    pendingTimeout = setTimeout(() => {
      if (Date.now() < deadline && isInitialSyncInFlight(getPHStore())) {
        scheduleTick();
        return;
      }
      cancelPendingDriveSelection();
      openTarget(undefined);
    }, DEFERRED_DRIVE_TICK_MS);
  };
  scheduleTick();
}
