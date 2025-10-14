import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
  SharingType,
  Trigger,
} from "document-drive";
import { getDriveSharingType } from "document-drive";
import { getDriveAvailableOffline } from "../utils/drives.js";
import { resolveUrlPathname } from "../utils/url.js";
import { useDispatch } from "./dispatch.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { setSelectedNode } from "./nodes.js";

export const {
  useValue: useDrives,
  setValue: setDrives,
  addEventHandler: addDrivesEventHandler,
} = makePHEventFunctions("drives");

export const {
  useValue: useSelectedDriveId,
  setValue: _setSelectedDriveId,
  addEventHandler: addSelectedDriveIdEventHandler,
} = makePHEventFunctions("selectedDriveId");

export function useDriveById(
  driveId: string | undefined | null,
): [DocumentDriveDocument, DocumentDispatch<DocumentDriveAction>] {
  const drives = useDrives();
  const foundDrive = drives?.find((drive) => drive.header.id === driveId);
  const [drive, dispatch] = useDispatch(foundDrive);
  if (!foundDrive) {
    throw new Error(`Drive with id ${driveId} not found`);
  }
  return [drive, dispatch] as [
    DocumentDriveDocument,
    DocumentDispatch<DocumentDriveAction>,
  ];
}

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
  setSelectedNode(undefined);
  _setSelectedDriveId(driveSlug);

  // Find the drive by slug to get its actual ID
  const drive = window.ph?.drives?.find((d) => d.header.slug === driveSlug);
  const driveId = drive?.header.id;
  if (!driveId) {
    window.history.pushState(null, "", resolveUrlPathname("/"));
    return;
  }
  window.history.pushState(null, "", resolveUrlPathname(`/d/${driveSlug}`));
}

/** Returns the remote URL for a drive. */
export function useDriveRemoteUrl(driveId: string | null | undefined) {
  const [drive] = useDriveById(driveId);
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
  const [drive] = useDriveById(driveId);

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
  const [drive] = useDriveById(driveId);
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns the sharing type for the selected drive. */
export function useSelectedDriveSharingType(): SharingType | undefined {
  const [drive] = useSelectedDriveSafe();
  if (!drive) return undefined;
  return getDriveSharingType(drive);
}

/** Returns  whether a drive is available offline. */
export function useDriveAvailableOffline(driveId: string | null | undefined) {
  const [drive] = useDriveById(driveId);
  if (!drive) return false;
  return getDriveAvailableOffline(drive);
}
