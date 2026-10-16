import { getPHStore } from "./ph-store.js";
import {
  extractDriveSlugFromPath,
  extractNodeIdFromSlug,
  extractNodeSlugFromPath,
  findDriveBySlug,
} from "../utils/url.js";
import {
  getCurrentPathname,
  hasHostNavigation,
  setBrowserOpenSync,
} from "./navigation.js";
import { selectDrive, setSelectedDriveId } from "./selected-drive.js";
import { setSelectedNodeId } from "./set-selected-node.js";

/** Applies a path's selection without writing the URL; idempotent.
 * @deprecated Set the store's `navigation`; its route loaders write the selection. */
export function syncSelectionFromPath(pathname = getCurrentPathname()) {
  // Boot runs the first sync once drives are loaded.
  const drives = getPHStore()?.drives;
  if (!drives) return;

  const driveSlug = extractDriveSlugFromPath(pathname);
  const selectedDriveId = getPHStore()?.selectedDriveId;
  if (!driveSlug) {
    if (selectedDriveId) selectDrive(undefined);
    return;
  }

  // URLs carry the drive's raw slug, as written by setSelectedDrive.
  const drive = findDriveBySlug(drives, driveSlug);
  const selectedIsUnlisted =
    !!selectedDriveId && !drives.some((d) => d.header.id === selectedDriveId);
  if (drive) {
    if (drive.header.id !== selectedDriveId) {
      setSelectedDriveId(drive.header.id);
    }
  } else if (!selectedIsUnlisted) {
    // Defers until the drive syncs in, or redirects home.
    selectDrive(driveSlug);
    return;
  }
  // Otherwise keep a just-created drive selected before the list includes it.

  const nodeId = extractNodeIdFromSlug(extractNodeSlugFromPath(pathname));
  if (nodeId !== getPHStore()?.selectedNodeId) {
    setSelectedNodeId(nodeId);
  }
}

setBrowserOpenSync(() => syncSelectionFromPath());

function syncOnPopState() {
  // A host navigation syncs from its own location subscription.
  if (hasHostNavigation()) return;
  syncSelectionFromPath(window.location.pathname);
}

let popStateHandlerAdded = false;

/** Syncs the selection on back/forward when no host navigation is set.
 * @deprecated Set the store's `navigation`; its router handles back/forward. */
export function addSyncSelectionOnPopStateEventHandler() {
  if (popStateHandlerAdded) return;
  popStateHandlerAdded = true;
  window.addEventListener("popstate", syncOnPopState);
}

/** @deprecated Set the store's `navigation`; its router handles back/forward. */
export const addSetSelectedDriveOnPopStateEventHandler =
  addSyncSelectionOnPopStateEventHandler;

/** @deprecated Set the store's `navigation`; its router handles back/forward. */
export const addSetSelectedNodeOnPopStateEventHandler =
  addSyncSelectionOnPopStateEventHandler;
