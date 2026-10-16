import type { PHStore } from "./ph-store.js";
import {
  getPHStore,
  isScopedPHStore,
  usePHStore,
  warnGlobalSetterInScope,
} from "./ph-store.js";
import { useCallback } from "react";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
} from "../utils/url.js";
import { useDispatch } from "./dispatch.js";
import { useDrives } from "./drives.js";
import {
  makePHEventFunctions,
  subscribeToPHValue,
} from "./make-ph-event-functions.js";
import {
  getCurrentPathname,
  hasHostNavigation,
  openTarget,
  openTargetWith,
  preloadTarget,
} from "./navigation.js";
import { selectNode } from "./set-selected-node.js";

const selectedDriveIdEventFunctions = makePHEventFunctions("selectedDriveId");

/** Returns the selected drive id */
export const useSelectedDriveId = selectedDriveIdEventFunctions.useValue;

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
  const selectedDriveId = useSelectedDriveId();
  const drives = useDrives();
  const selectedDrive = drives?.find(
    (drive) => drive.header.id === selectedDriveId,
  );

  const [drive, dispatch] = useDispatch(selectedDrive);
  if (!selectedDrive) {
    return [undefined, undefined] as const;
  }
  return [drive, dispatch] as [
    DocumentDriveDocument,
    DocumentDispatch<DocumentDriveAction>,
  ];
}

type DriveRef = string | DocumentDriveDocument | undefined;

/** Selects a drive in the app's store; inside a scoped store, use
 * `useSetSelectedDrive`. */
export function setSelectedDrive(driveOrDriveSlug: DriveRef) {
  warnGlobalSetterInScope("setSelectedDrive", "useSetSelectedDrive");
  selectDrive(driveOrDriveSlug);
}

/** Selects a drive in `store`: a scope's own selection, else the app's. */
export function selectDriveIn(
  store: PHStore | undefined,
  driveOrDriveSlug: DriveRef,
) {
  if (!store || !isScopedPHStore(store)) {
    selectDrive(driveOrDriveSlug);
    return;
  }
  const driveSlug =
    typeof driveOrDriveSlug === "string"
      ? driveOrDriveSlug
      : driveOrDriveSlug?.header.slug;
  if (store.navigation) {
    openTargetWith(store.navigation, driveSlug ? { driveSlug } : undefined);
    return;
  }
  const drive =
    typeof driveOrDriveSlug === "object"
      ? driveOrDriveSlug
      : store.drives?.find((d) => d.header.slug === driveSlug);
  store.selectedDriveId = drive?.header.id;
  store.selectedNodeId = undefined;
}

/** `setSelectedDrive` for the store in context, e.g. a scoped editor's. */
export function useSetSelectedDrive() {
  const store = usePHStore();
  return useCallback((drive: DriveRef) => selectDriveIn(store, drive), [store]);
}

/** Selects a drive in the app's store, without the scope warning. */
export function selectDrive(driveOrDriveSlug: DriveRef) {
  const driveSlug =
    typeof driveOrDriveSlug === "string"
      ? driveOrDriveSlug
      : driveOrDriveSlug?.header.slug;

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
      : drives?.find((d) => d.header.slug === driveSlug);
  const driveId = drive?.header.id;

  // Deprecated: hosts without a navigation only.
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
  warnGlobalSetterInScope("preloadDrive", "usePreloadDrive");
  if (drive) preloadTarget({ driveSlug: drive.header.slug });
}

/** `preloadDrive` for the store in context. */
export function usePreloadDrive() {
  const store = usePHStore();
  return useCallback(
    (drive: DocumentDriveDocument | undefined) => {
      if (!drive) return;
      if (!isScopedPHStore(store)) {
        preloadTarget({ driveSlug: drive.header.slug });
        return;
      }
      store?.navigation?.preload?.({ driveSlug: drive.header.slug });
    },
    [store],
  );
}

// Tick between unresolved-slug checks; re-armed while a sync is in flight.
const DEFERRED_DRIVE_TICK_MS = 2_000;
// Hard cap so a wedged remote can't pin the deep link forever.
const DEFERRED_DRIVE_MAX_WAIT_MS = 15_000;

// True while any sync remote has not completed its first successful pull —
// a drive may still be on its way in, so the deferred lookup keeps waiting.
function isInitialSyncInFlight(): boolean {
  const remotes =
    getPHStore()?.reactorClientModule?.reactorModule?.syncModule?.syncManager?.list();
  if (!remotes?.length) {
    return false;
  }
  return remotes.some((remote) => {
    try {
      const snapshot = remote.channel.getConnectionState();
      return (
        snapshot.receivingPages ||
        (!snapshot.lastSuccessUtcMs && snapshot.state !== "error")
      );
    } catch {
      return false;
    }
  });
}

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
    const drive = getPHStore()?.drives?.find(
      (d) => d.header.slug === driveSlug,
    );
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
      if (Date.now() < deadline && isInitialSyncInFlight()) {
        scheduleTick();
        return;
      }
      cancelPendingDriveSelection();
      openTarget(undefined);
    }, DEFERRED_DRIVE_TICK_MS);
  };
  scheduleTick();
}
