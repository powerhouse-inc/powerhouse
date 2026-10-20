import {
  setSelectedDrive,
  useConnectionStates,
  useDrives,
  useSelectedDriveId,
  useSync,
  useUser,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

/** Return code for the auth gate decision:
 * - `"login"`  : anonymous user, the selected drive's channel rejected with `requiresAuth`.
 * - `"unauthorized"` : signed in, but the selected drive's channel was rejected — they aren't the owner.
 * - `null`   : no auth barrier on the selected drive, carry on. */
export type AuthGate = "login" | "unauthorized" | null;

/** A remote, reduced to the two fields the gate decision needs. */
export type AuthGateRemote = {
  readonly name: string;
  readonly driveId: string;
};

export type AuthGateSelection = {
  readonly selectedDriveId: string | undefined;
  readonly remotes: readonly AuthGateRemote[];
};

/**
 * Decides the gate for the drive the user selected, and only that drive. A
 * refusal on any other drive must not hide the rest of Connect.
 *
 * Connection states are keyed by remote name, which is a random uuid, so the
 * caller supplies the remote -> drive mapping.
 */
export function computeAuthGate(
  isAuthenticated: boolean,
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>,
  selection: AuthGateSelection,
): AuthGate {
  const { selectedDriveId, remotes } = selection;
  if (!selectedDriveId) return null;

  let refused = false;
  for (const remote of remotes) {
    if (remote.driveId !== selectedDriveId) continue;
    const snapshot = connectionStates.get(remote.name);
    if (snapshot?.state === "error" && snapshot.requiresAuth) {
      refused = true;
      break;
    }
  }
  if (!refused) return null;
  return isAuthenticated ? "unauthorized" : "login";
}

// Drives dismissed from the auth gate. Deliberately in memory and session
// scoped: the reactor keeps a refused drive's storage record, so a reload while
// signed in must bring the drive back rather than fight that recovery.
const hiddenDriveIds = new Set<string>();
let hiddenDriveIdsSnapshot: readonly string[] = [];
const hiddenDriveListeners = new Set<() => void>();

function publishHiddenDrives(): void {
  hiddenDriveIdsSnapshot = [...hiddenDriveIds];
  for (const listener of [...hiddenDriveListeners]) {
    listener();
  }
}

function subscribeHiddenDrives(listener: () => void): () => void {
  hiddenDriveListeners.add(listener);
  return () => {
    hiddenDriveListeners.delete(listener);
  };
}

function getHiddenDriveIds(): readonly string[] {
  return hiddenDriveIdsSnapshot;
}

/** Hides a drive from Connect's drive lists until the page reloads. */
export function hideDriveForSession(driveId: string): void {
  if (hiddenDriveIds.has(driveId)) return;
  hiddenDriveIds.add(driveId);
  publishHiddenDrives();
}

/** Restores every drive hidden this session. */
export function clearHiddenDrives(): void {
  if (hiddenDriveIds.size === 0) return;
  hiddenDriveIds.clear();
  publishHiddenDrives();
}

export function useHiddenDriveIds(): readonly string[] {
  return useSyncExternalStore(
    subscribeHiddenDrives,
    getHiddenDriveIds,
    getHiddenDriveIds,
  );
}

/** `useDrives()` minus the drives dismissed from the auth gate this session. */
export function useVisibleDrives(): DocumentDriveDocument[] | undefined {
  const drives = useDrives();
  const hidden = useHiddenDriveIds();
  return useMemo(() => {
    if (!drives || hidden.length === 0) return drives;
    return drives.filter((drive) => !hidden.includes(drive.header.id));
  }, [drives, hidden]);
}

/** Live wrapper over {@link computeAuthGate}, plus the dismiss action. */
export function useDriveAuthGate(): { gate: AuthGate; dismiss: () => void } {
  const user = useUser();
  const connectionStates = useConnectionStates();
  const syncManager = useSync();
  const selectedDriveId = useSelectedDriveId();

  // Remote names are random uuids; `meta.collectionId.driveId` is the only link
  // from a connection state back to the drive it belongs to. Recomputed
  // alongside `connectionStates`, which also refreshes as remotes come and go.
  const remotes = useMemo<AuthGateRemote[]>(
    () =>
      (syncManager?.list() ?? []).map((remote) => ({
        name: remote.meta.name,
        driveId: remote.meta.collectionId.driveId,
      })),
    [syncManager, connectionStates],
  );

  // A change of identity changes who the drive would be fetched as, so give the
  // dismissed drives another chance instead of waiting for a reload.
  const address = user?.address;
  useEffect(() => {
    clearHiddenDrives();
  }, [address]);

  const dismiss = useCallback(() => {
    if (selectedDriveId) {
      hideDriveForSession(selectedDriveId);
    }
    setSelectedDrive(undefined);
  }, [selectedDriveId]);

  const gate = computeAuthGate(Boolean(user), connectionStates, {
    selectedDriveId,
    remotes,
  });
  return { gate, dismiss };
}
