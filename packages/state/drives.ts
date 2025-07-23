import {
  logger,
  type DocumentDriveDocument,
  type IDocumentDriveServer,
  type Trigger,
} from "document-drive";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  baseDrivesAtom,
  drivesAtom,
  loadableDrivesAtom,
  loadableSelectedDriveAtom,
  selectedDriveAtom,
  unwrappedDrivesAtom,
  unwrappedSelectedDriveAtom,
} from "./atoms.js";
import { useUnwrappedDocuments } from "./documents.js";
import { useUnwrappedReactor } from "./reactor.js";
import { type Loadable, type SharingType } from "./types.js";
import { makeDriveUrlComponent, NOT_SET } from "./utils.js";

/** Returns a loadable of the drives for a reactor. */
export function useDrives(): Loadable<DocumentDriveDocument[]> {
  return useAtomValue(loadableDrivesAtom);
}

/** Returns a resolved promise of the drives for a reactor. */
export function useUnwrappedDrives() {
  return useAtomValue(unwrappedDrivesAtom);
}

/** Initializes the drives for a reactor. */
export function useInitializeDrives() {
  const baseDrives = useAtomValue(baseDrivesAtom);
  const setDrives = useSetDrives();
  const reactor = useUnwrappedReactor();

  useEffect(() => {
    if (baseDrives !== NOT_SET) return;

    async function handleInitializeDrives() {
      if (!reactor) return;

      // Initialize the drives.
      const driveIds = await reactor.getDrives();
      const drives = await Promise.all(
        driveIds.map((driveId) => reactor.getDrive(driveId)),
      );
      setDrives(drives);
    }

    handleInitializeDrives().catch((error: unknown) => logger.error(error));
  }, [baseDrives, setDrives, reactor]);
}

/** Sets the drives for a reactor. */
export function useSetDrives() {
  return useSetAtom(drivesAtom);
}

/** Refreshes the drives for a reactor. */
export function useRefreshDrives() {
  const setDrives = useSetDrives();

  return useCallback(
    (reactor: IDocumentDriveServer) => {
      reactor
        .getDrives()
        .then(async (driveIds) => {
          const drives = await Promise.all(
            driveIds.map((id) => reactor.getDrive(id)),
          );
          setDrives(drives);
        })
        .catch((error: unknown) => logger.error(error));
    },
    [setDrives],
  );
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
  const reactor = useUnwrappedReactor();
  const setSelectedDrive = useSetAtom(selectedDriveAtom);

  return useCallback(
    (driveId: string | undefined, _shouldNavigate = shouldNavigate) => {
      // Set the selected drive.
      setSelectedDrive(driveId).catch((error: unknown) => logger.error(error));

      if (!reactor) return;

      reactor
        .getDrives()
        .then(async (driveIds) => {
          const drives = await Promise.all(
            driveIds.map((id) => reactor.getDrive(id)),
          );
          const drive = drives.find((d) => d.header.id === driveId);
          const newPathname = makeDriveUrlComponent(drive);
          // Update the URL if `shouldNavigate` is true.

          if (typeof window !== "undefined" && _shouldNavigate) {
            window.history.pushState(null, "", newPathname);
          }
        })
        .catch((error: unknown) => logger.error(error));
    },
    [reactor, setSelectedDrive],
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
