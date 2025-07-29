import { type DocumentDriveDocument, type Trigger } from "document-drive";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import {
  loadableDrivesAtom,
  loadableSelectedDriveAtom,
  unwrappedDrivesAtom,
  unwrappedSelectedDriveAtom,
} from "../internal/atoms.js";
import { dispatchSetDriveEvent } from "../internal/events.js";
import { type Loadable, type SharingType } from "../internal/types.js";
import {
  getDriveAvailableOffline,
  getDriveSharingType,
} from "../utils/drives.js";
import { useEditorModuleById } from "./ph-packages.js";

/** Returns the drives for a reactor. */
export function useDrives() {
  return useAtomValue(unwrappedDrivesAtom);
}

/** Returns a loadable of the drives for a reactor. */
export function useLoadableDrives(): Loadable<
  DocumentDriveDocument[] | undefined
> {
  return useAtomValue(loadableDrivesAtom);
}

/** Returns a drive by id. */
export function useDriveById(
  id: string | null | undefined,
): DocumentDriveDocument | undefined {
  const drives = useDrives();
  if (!id) return undefined;
  return drives?.find((d) => d.header.id === id);
}

/** Returns a loadable of a drive by id. */
export function useLoadableDriveById(
  id: string | null | undefined,
): Loadable<DocumentDriveDocument | undefined> {
  const loadableDrives = useLoadableDrives();
  if (loadableDrives.state !== "hasData") return loadableDrives;
  if (!id) return { state: "hasData", data: undefined };
  const data = loadableDrives.data;
  return {
    state: "hasData",
    data: data?.find((d) => d.header.id === id),
  };
}

/** Returns the selected drive */
export function useSelectedDrive(): DocumentDriveDocument | undefined {
  return useAtomValue(unwrappedSelectedDriveAtom);
}

/** Returns a loadable of the selected drive */
export function useLoadableSelectedDrive(): Loadable<
  DocumentDriveDocument | undefined
> {
  return useAtomValue(loadableSelectedDriveAtom);
}

/** Returns a function that sets the selected drive with a drive id. */
export function useSetSelectedDrive() {
  return useCallback((driveId: string | undefined) => {
    dispatchSetDriveEvent(driveId);
  }, []);
}

/** Returns the selected drive id. */
export function useSelectedDriveId(): string | undefined {
  const selectedDrive = useSelectedDrive();
  return selectedDrive?.header.id;
}

/** Returns the remote URL for a drive. */
export function useDriveRemoteUrl(driveId: string | null | undefined) {
  const drive = useDriveById(driveId);
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
  const drive = useDriveById(driveId);

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
  const drive = useDriveById(driveId);
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns the sharing type for the selected drive. */
export function useSelectedDriveSharingType(): SharingType | undefined {
  const drive = useSelectedDrive();
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns  whether a drive is available offline. */
export function useDriveAvailableOffline(driveId: string | null | undefined) {
  const drive = useDriveById(driveId);
  if (!drive) return false;
  return getDriveAvailableOffline(drive);
}

/** Returns the id of the preferred editor for a drive. */
export function useDrivePreferredEditorId(driveId: string | null | undefined) {
  const drive = useDriveById(driveId);
  if (!drive) return undefined;
  return drive.header.meta?.preferredEditor;
}

/** Returns the preferred editor for the selected drive. */
export function useSelectedDrivePreferredEditorId() {
  const drive = useSelectedDrive();
  if (!drive) return undefined;
  return drive.header.meta?.preferredEditor;
}

export function useDrivePreferredEditor(driveId: string | null | undefined) {
  const editorId = useDrivePreferredEditorId(driveId);
  if (!editorId) return undefined;
  const editorModule = useEditorModuleById(editorId);
  return editorModule;
}

export function useSelectedDrivePreferredEditor() {
  const editorId = useSelectedDrivePreferredEditorId();
  if (!editorId) return undefined;
  const editorModule = useEditorModuleById(editorId);
  return editorModule;
}
