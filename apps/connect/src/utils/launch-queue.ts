import {
  PWA_SHARE_TARGET_INBOX_CACHE,
  PWA_SHARE_TARGET_REDIRECT_PARAM,
} from "@powerhousedao/shared/connect";
import { showPHModal } from "@powerhousedao/reactor-browser";

// PWA File Handling: consume documents the OS opens with the installed
// Connect app (manifest file_handlers, see builder-tools' PWA plugin). The
// consumer stashes the launched files in the pending store below and opens
// the openFileDocuments modal, which owns the drive picking + import flow.
//
// Same shape as registerServiceWorker.ts: a module singleton with a tiny
// external store consumed via useSyncExternalStore.

// External store holding files launched but not yet imported. Repeated
// launches into an already-focused window (launch_handler: focus-existing)
// merge into it.
let pendingImportFiles: File[] = [];
const pendingListeners = new Set<() => void>();

function notifyPendingListeners() {
  for (const listener of pendingListeners) listener();
}

export function getPendingImportFiles(): File[] {
  return pendingImportFiles;
}

/** Stable identity of a pending file (also the picker's pre-check cache key). */
export function pendingFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function addPendingImportFiles(files: File[]) {
  // Re-opening a file that is already waiting (e.g. after detouring to create
  // a drive) must not queue it twice.
  const seen = new Set(pendingImportFiles.map(pendingFileKey));
  const fresh = files.filter((file) => {
    const key = pendingFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  pendingImportFiles = [...pendingImportFiles, ...fresh];
  notifyPendingListeners();
}

export function clearPendingImportFiles() {
  if (pendingImportFiles.length === 0) return;
  pendingImportFiles = [];
  notifyPendingListeners();
}

export function subscribePendingImportFiles(cb: () => void): () => void {
  pendingListeners.add(cb);
  return () => {
    pendingListeners.delete(cb);
  };
}

async function handleLaunchParams(params: LaunchParams) {
  const handles = params.files.filter(
    (handle): handle is FileSystemFileHandle => handle.kind === "file",
  );
  // A plain focus/navigate launch carries no files.
  if (handles.length === 0) return;

  const files: File[] = [];
  for (const handle of handles) {
    try {
      files.push(await handle.getFile());
    } catch (error) {
      // Permission/IO failure on one file must not drop the rest.
      console.error("Failed to read launched file:", handle.name, error);
    }
  }
  if (files.length === 0) return;

  addPendingImportFiles(files);
  showPHModal({ type: "openFileDocuments" });
}

// Re-surface the picker when another modal closes while launched files are
// still waiting — e.g. after the zero-drives detour through the create-drive
// modal, so the user doesn't have to open the file again. Cancelling the
// import clears the pending store BEFORE closing, so this can't loop.
function maybeReopenImportModal() {
  if (getPendingImportFiles().length === 0) return;
  if (window.ph?.modal !== undefined) return;
  showPHModal({ type: "openFileDocuments" });
}

/**
 * Drain files the OS share sheet handed us. The service worker's share-target
 * route stashes shared files in a Cache and redirects here with a marker query
 * param; on boot we turn the stashed responses back into Files and feed them
 * into the same import flow as a file-handler launch. Best-effort and a no-op
 * when the marker is absent or the Cache API is unavailable.
 */
async function drainShareTargetInbox() {
  if (typeof caches === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PWA_SHARE_TARGET_REDIRECT_PARAM)) return;
  // Strip the marker so a reload doesn't re-open the picker.
  url.searchParams.delete(PWA_SHARE_TARGET_REDIRECT_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
  try {
    const cache = await caches.open(PWA_SHARE_TARGET_INBOX_CACHE);
    const requests = await cache.keys();
    const files: File[] = [];
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;
      const blob = await response.blob();
      const name = decodeURIComponent(
        response.headers.get("X-PH-Share-Name") ?? "shared-file",
      );
      files.push(new File([blob], name, { type: blob.type }));
      await cache.delete(request);
    }
    if (files.length === 0) return;
    addPendingImportFiles(files);
    showPHModal({ type: "openFileDocuments" });
  } catch (error) {
    console.error("Failed to drain the share-target inbox:", error);
  }
}

let initialized = false;

/**
 * Register the launchQueue consumer that receives files opened with Connect
 * through the OS file association, and drain any OS-shared files the service
 * worker stashed. Idempotent (safe under StrictMode double effects) and a no-op
 * where the File Handling API doesn't exist — Firefox, Safari, and any context
 * without an installed PWA manifest simply never deliver launches.
 */
export function initLaunchQueueFileHandling() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("ph:modalUpdated", maybeReopenImportModal);
  window.launchQueue?.setConsumer((params) => {
    void handleLaunchParams(params);
  });
  void drainShareTargetInbox();
}
