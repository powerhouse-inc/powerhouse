import { type DocumentDriveDocument, type Trigger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import {
  drivesAtom,
  loadableDrivesAtom,
  loadableSelectedDriveAtom,
  selectedDriveAtom,
  unwrappedDrivesAtom,
  unwrappedSelectedDriveAtom,
} from "./atoms.js";
import { useUnwrappedDocuments } from "./documents.js";
import { type Loadable, type SharingType } from "./types.js";
import { makeDriveUrlComponent } from "./utils.js";

/** Returns a loadable of the drives for a reactor. */
export function useDrives(): Loadable<DocumentDriveDocument[]> {
  return useAtomValue(loadableDrivesAtom);
}

/** Returns a resolved promise of the drives for a reactor. */
export function useUnwrappedDrives() {
  return useAtomValue(unwrappedDrivesAtom);
}

/** Refreshes the drives for a reactor. */
export function useRefreshDrives() {
  return useSetAtom(drivesAtom);
}

/** Returns a loadable of a drive for a reactor by id. */
export function useDriveById(
  id: string | null | undefined,
): Loadable<DocumentDriveDocument | undefined> {
  const loadableDrives = useDrives();
  if (loadableDrives.state !== "hasData") return loadableDrives;
  if (!id) return { state: "hasData", data: undefined };
  const data = loadableDrives.data;
  return {
    state: "hasData",
    data: data.find((d) => d.header.id === id),
  };
}

/** Returns a resolved promise of a drive for a reactor by id. */
export function useUnwrappedDriveById(
  id: string | null | undefined,
): DocumentDriveDocument | undefined {
  const drives = useUnwrappedDrives();
  if (!id) return undefined;
  return drives?.find((d) => d.header.id === id);
}

/** Returns a loadable of the selected drive */
export function useSelectedDrive(): Loadable<
  DocumentDriveDocument | undefined
> {
  return useAtomValue(loadableSelectedDriveAtom);
}

/** Returns a resolved promise of the selected drive */
export function useUnwrappedSelectedDrive(): DocumentDriveDocument | undefined {
  return useAtomValue(unwrappedSelectedDriveAtom);
}

/** Returns a function that sets the selected drive with a drive id.
 *
 * If `shouldNavigate` is true, the URL will be updated to the new drive.
 * `shouldNavigate` can be overridden by passing a different value to the callback.
 */
export function useSetSelectedDrive(shouldNavigate = true) {
  const drives = useUnwrappedDrives();
  const setSelectedDrive = useSetAtom(selectedDriveAtom);

  return useCallback(
    (driveId: string | undefined, _shouldNavigate = shouldNavigate) => {
      setSelectedDrive(driveId);
      const drive = drives?.find((d) => d.header.id === driveId);
      const newPathname = makeDriveUrlComponent(drive);
      if (typeof window !== "undefined" && _shouldNavigate) {
        window.history.pushState(null, "", newPathname);
      }
    },
    [drives, setSelectedDrive],
  );
}

/** Returns the documents for a drive id. */
export function useDocumentsForDriveId(driveId: string | null | undefined) {
  const drive = useUnwrappedDriveById(driveId);
  const documents = useUnwrappedDocuments();
  if (!drive || !documents) return [];
  return documents.filter((document) => {
    const node = drive.state.global.nodes.find(
      (node) => node.id === document.header.id,
    );
    return node !== undefined;
  });
}

/** Returns the documents for the selected drive. */
export function useDocumentsForSelectedDrive() {
  const selectedDrive = useUnwrappedSelectedDrive();
  return useDocumentsForDriveId(selectedDrive?.header.id);
}

/** Returns the remote URL for a drive. */
export function useDriveRemoteUrl(driveId: string | null | undefined) {
  const drive = useUnwrappedDriveById(driveId);
  const pullResponderUrl = useDrivePullResponderUrl(driveId);

  if (!drive) return undefined;

  if ("remoteUrl" in drive.state.global) {
    const remoteUrl = drive.state.global.remoteUrl;
    if (typeof remoteUrl === "string") {
      return remoteUrl;
    }
  }

  return pullResponderUrl;
}

/** Returns the pull responder trigger for a drive. */
export function useDrivePullResponderTrigger(
  driveId: string | null | undefined,
): Trigger | undefined {
  const drive = useUnwrappedDriveById(driveId);

  const pullResponder = drive?.state.local.triggers.find(
    (trigger) => trigger.type === "PullResponder",
  );
  return pullResponder;
}

/** Returns the pull responder URL for a drive. */
export function useDrivePullResponderUrl(driveId: string | null | undefined) {
  const pullResponder = useDrivePullResponderTrigger(driveId);
  return pullResponder?.data?.url;
}

/** Returns whether a drive is remote. */
export function useDriveIsRemote(driveId: string | null | undefined) {
  const remoteUrl = useDriveRemoteUrl(driveId);
  const pullResponder = useDrivePullResponderTrigger(driveId);
  return remoteUrl !== undefined || pullResponder !== undefined;
}

/** Returns the sharing type for a drive. */
export function useDriveSharingType(
  driveId: string | null | undefined,
): SharingType | undefined {
  const drive = useUnwrappedDriveById(driveId);
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns the sharing type for the selected drive. */
export function useSelectedDriveSharingType(): SharingType | undefined {
  const drive = useUnwrappedSelectedDrive();
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns  whether a drive is available offline. */
export function useDriveAvailableOffline(driveId: string | null | undefined) {
  const drive = useUnwrappedDriveById(driveId);
  if (!drive) return false;
  return getDriveAvailableOffline(drive);
}

/** Returns the sharing type for a drive. */
export function getDriveSharingType(
  drive:
    | {
        state: {
          local: {
            sharingType?: string | null;
          };
        };
        readContext?: {
          sharingType?: string | null;
        };
      }
    | undefined
    | null,
) {
  if (!drive) return "PUBLIC";
  const isReadDrive = "readContext" in drive;
  const { sharingType: _sharingType } = !isReadDrive
    ? drive.state.local
    : { sharingType: "PUBLIC" };
  const __sharingType = _sharingType?.toUpperCase();
  return (__sharingType === "PRIVATE" ? "LOCAL" : __sharingType) as SharingType;
}

/** Returns whether a drive is available offline. */
export function getDriveAvailableOffline(
  drive:
    | {
        state: {
          local: {
            availableOffline?: boolean | null;
          };
        };
        readContext?: {
          availableOffline?: boolean | null;
        };
      }
    | undefined
    | null,
) {
  if (!drive) return false;
  const isReadDrive = "readContext" in drive;
  const { availableOffline: _availableOffline } = !isReadDrive
    ? drive.state.local
    : { availableOffline: false };
  return _availableOffline ?? false;
}
