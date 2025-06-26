import { type DocumentDriveDocument, type Trigger } from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import { useCallback } from "react";
import {
  drivesAtom,
  loadableDrivesAtom,
  loadableSelectedDriveAtom,
  selectedDriveAtom,
  unwrappedDrivesAtom,
  unwrappedSelectedDriveAtom,
} from "./atoms.js";
import { type SharingType } from "./types.js";
import { makeDriveUrlComponent } from "./utils.js";

export function useDrives() {
  return useAtomValue(loadableDrivesAtom);
}

export function useRefreshDrives() {
  return useSetAtom(drivesAtom);
}

export function useUnwrappedDrives() {
  return useAtomValue(unwrappedDrivesAtom);
}

export function useDriveById(
  id: string | null | undefined,
): Loadable<DocumentDriveDocument | undefined> {
  const loadableDrives = useDrives();
  if (loadableDrives.state !== "hasData") return loadableDrives;
  if (!id) return { state: "hasData", data: undefined };
  const data = loadableDrives.data;
  return {
    state: "hasData",
    data: data.find((d) => d?.id === id),
  };
}

export function useUnwrappedDriveById(
  id: string | null | undefined,
): DocumentDriveDocument | undefined {
  const drives = useUnwrappedDrives();
  if (!id) return undefined;
  return drives?.find((d) => d?.id === id);
}

export function useSelectedDrive() {
  return useAtomValue(loadableSelectedDriveAtom);
}

export function useUnwrappedSelectedDrive() {
  return useAtomValue(unwrappedSelectedDriveAtom);
}

export function useSetSelectedDrive() {
  const drives = useUnwrappedDrives();
  const setSelectedDrive = useSetAtom(selectedDriveAtom);

  return useCallback(
    (driveId: string | undefined, shouldNavigate = true) => {
      setSelectedDrive(driveId);
      const drive = drives?.find((d) => d.id === driveId);
      const newPathname = makeDriveUrlComponent(drive);
      if (typeof window !== "undefined" && shouldNavigate) {
        window.history.pushState(null, "", newPathname);
      }
    },
    [drives, setSelectedDrive],
  );
}

export function useDriveRemoteUrl(
  driveId: string | null | undefined,
): Loadable<string | undefined> {
  const loadableDrive = useDriveById(driveId);
  const pullResponderUrl = useDrivePullResponderUrl(driveId);

  if (!driveId) return { state: "hasData", data: undefined };
  if (loadableDrive.state !== "hasData") return loadableDrive;

  const drive = loadableDrive.data;
  if (!drive) return { state: "hasData", data: undefined };

  if ("remoteUrl" in drive.state.global) {
    const remoteUrl = drive.state.global.remoteUrl;
    if (typeof remoteUrl === "string") {
      return {
        state: "hasData",
        data: remoteUrl,
      };
    }
  }

  if (pullResponderUrl.state !== "hasData") return pullResponderUrl;

  return {
    state: "hasData",
    data: undefined,
  };
}

export function useDrivePullResponderTrigger(
  driveId: string | null | undefined,
): Loadable<Trigger | undefined> {
  const loadableDrive = useDriveById(driveId);
  if (!driveId) return { state: "hasData", data: undefined };
  if (loadableDrive.state !== "hasData") return loadableDrive;
  const drive = loadableDrive.data;
  if (!drive) return { state: "hasData", data: undefined };

  const pullResponder = drive.state.local.triggers.find(
    (trigger) => trigger.type === "PullResponder",
  );
  return {
    state: "hasData",
    data: pullResponder,
  };
}

export function useDrivePullResponderUrl(
  driveId: string | null | undefined,
): Loadable<string | undefined> {
  const pullResponder = useDrivePullResponderTrigger(driveId);
  if (!driveId) return { state: "hasData", data: undefined };
  if (pullResponder.state !== "hasData") return pullResponder;
  const trigger = pullResponder.data;
  return {
    state: "hasData",
    data: trigger?.data?.url,
  };
}

export function useDriveIsRemote(
  driveId: string | null | undefined,
): Loadable<boolean> {
  const remoteUrl = useDriveRemoteUrl(driveId);
  const pullResponder = useDrivePullResponderTrigger(driveId);
  if (!driveId) return { state: "hasData", data: false };
  if (remoteUrl.state === "loading" || pullResponder.state === "loading")
    return {
      state: "loading",
    };
  if (remoteUrl.state === "hasError")
    return {
      state: "hasError",
      error: remoteUrl.error,
    };
  if (pullResponder.state === "hasError")
    return {
      state: "hasError",
      error: pullResponder.error,
    };
  return {
    state: "hasData",
    data: remoteUrl.data !== undefined || pullResponder.data !== undefined,
  };
}

export function useDriveSharingType(
  driveId: string | null | undefined,
): Loadable<SharingType | undefined> {
  const loadableDrive = useDriveById(driveId);
  if (!driveId) return { state: "hasData", data: undefined };
  if (loadableDrive.state !== "hasData") return loadableDrive;
  const drive = loadableDrive.data;
  if (!drive) return { state: "hasData", data: undefined };
  return {
    state: "hasData",
    data: getDriveSharingType(drive),
  };
}

export function useIsDriveAvailableOffline(
  driveId: string | null | undefined,
): Loadable<boolean> {
  const loadableDrive = useDriveById(driveId);
  if (!driveId) return { state: "hasData", data: false };
  if (loadableDrive.state !== "hasData") return loadableDrive;
  const drive = loadableDrive.data;
  if (!drive) return { state: "hasData", data: false };
  return {
    state: "hasData",
    data: getDriveAvailableOffline(drive),
  };
}

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
