import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import {
  createUrlWithPreservedParams,
  extractDriveIdFromPath,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  resolveUrlPathname,
} from "../utils/url.js";
import { useDispatch } from "./dispatch.js";
import { useDrives } from "./drives.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { setSelectedNode } from "./set-selected-node.js";

const selectedDriveIdEventFunctions = makePHEventFunctions("selectedDriveId");

/** Returns the selected drive id */
export const useSelectedDriveId = selectedDriveIdEventFunctions.useValue;

/** Sets the selected drive id */
export const setSelectedDriveId = selectedDriveIdEventFunctions.setValue;

/** Adds an event handler for the selected drive id */
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

export function setSelectedDrive(
  driveOrDriveSlug: string | DocumentDriveDocument | undefined,
) {
  const driveSlug =
    typeof driveOrDriveSlug === "string"
      ? driveOrDriveSlug
      : driveOrDriveSlug?.header.slug;

  // A full drive document is selected directly — a just-created drive
  // navigates before the collection refresh. Slugs go through the lookup.
  const drives = window.ph?.drives;
  const drive =
    typeof driveOrDriveSlug === "object" && driveOrDriveSlug !== null
      ? driveOrDriveSlug
      : drives?.find((d) => d.header.slug === driveSlug);
  const driveId = drive?.header.id;

  // A URL-pinned slug with no matching drive: the deep link may predate
  // remote drive registration, so defer instead of rewriting the URL.
  if (
    !driveId &&
    driveSlug &&
    extractDriveSlugFromPath(window.location.pathname) === driveSlug
  ) {
    // Clear the previous selection so a stale drive doesn't render against
    // the new URL; the selected node resets with it, the URL is untouched.
    if (window.ph?.selectedDriveId) {
      setSelectedDriveId(undefined);
    }
    deferDriveSelection(driveSlug);
    return;
  }

  // Any resolved selection supersedes a pending deferred lookup.
  cancelPendingDriveSelection();

  setSelectedDriveId(driveId);

  if (!driveId) {
    const pathname = resolveUrlPathname("/");
    if (pathname === window.location.pathname) {
      return;
    }
    window.history.pushState(null, "", createUrlWithPreservedParams(pathname));
    return;
  }
  const pathname = resolveUrlPathname(`/d/${driveSlug}`);
  if (pathname === window.location.pathname) {
    return;
  }
  window.history.pushState(null, "", createUrlWithPreservedParams(pathname));
}

// Tick between unresolved-slug checks; re-armed while a sync is in flight.
const DEFERRED_DRIVE_TICK_MS = 2_000;
// Hard cap so a wedged remote can't pin the deep link forever.
const DEFERRED_DRIVE_MAX_WAIT_MS = 15_000;

// True while any sync remote has not completed its first successful pull —
// a drive may still be on its way in, so the deferred lookup keeps waiting.
function isInitialSyncInFlight(): boolean {
  const remotes =
    window.ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager?.list();
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

let pendingHandler: (() => void) | undefined;
let pendingTimeout: ReturnType<typeof setTimeout> | undefined;

function cancelPendingDriveSelection() {
  if (pendingHandler) {
    window.removeEventListener("ph:drivesUpdated", pendingHandler);
    pendingHandler = undefined;
  }
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = undefined;
  }
}

// Re-runs the slug lookup on each drives update until it resolves, then
// restores the URL-pinned node. Unresolved slugs redirect once syncs settle.
function deferDriveSelection(driveSlug: string) {
  cancelPendingDriveSelection();

  // Capture the node pinned in the deep link before setSelectedDrive
  // rewrites the URL to /d/<driveSlug>, dropping the node segment.
  const nodeSlug = extractNodeSlugFromPath(window.location.pathname);
  const handler = () => {
    const drive = window.ph?.drives?.find((d) => d.header.slug === driveSlug);
    if (!drive) {
      return;
    }
    cancelPendingDriveSelection();
    setSelectedDrive(driveSlug);
    setSelectedNode(nodeSlug);
  };
  pendingHandler = handler;
  window.addEventListener("ph:drivesUpdated", handler);

  const deadline = Date.now() + DEFERRED_DRIVE_MAX_WAIT_MS;
  const scheduleTick = () => {
    pendingTimeout = setTimeout(() => {
      if (Date.now() < deadline && isInitialSyncInFlight()) {
        scheduleTick();
        return;
      }
      cancelPendingDriveSelection();
      const pathname = resolveUrlPathname("/");
      if (pathname === window.location.pathname) {
        return;
      }
      window.history.pushState(
        null,
        "",
        createUrlWithPreservedParams(pathname),
      );
    }, DEFERRED_DRIVE_TICK_MS);
  };
  scheduleTick();
}

export function addSetSelectedDriveOnPopStateEventHandler() {
  window.addEventListener("popstate", () => {
    const pathname = window.location.pathname;
    const driveId = extractDriveIdFromPath(pathname);
    const selectedDriveId = window.ph?.selectedDriveId;
    if (driveId !== selectedDriveId) {
      setSelectedDrive(driveId);
    }
  });
}
