import type {
  DocumentDriveDocument,
  FolderNode,
  IDocumentDriveServer,
  SharingType,
  SyncStatus,
  Trigger,
} from "document-drive";
import { SynchronizationUnitNotFoundError } from "document-drive";
import type { PHDocument } from "document-model";

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

/** Makes a folder node from a drive, used for making breadcrumbs. */
export function makeFolderNodeFromDrive(
  drive: DocumentDriveDocument | null | undefined,
): FolderNode | undefined {
  if (!drive) return undefined;
  return {
    id: drive.header.id,
    name: drive.state.global.name,
    kind: "FOLDER",
    parentFolder: null,
  };
}

export async function getDocumentsForDriveId(
  reactor: IDocumentDriveServer | undefined,
  driveId: string | undefined,
): Promise<PHDocument[]> {
  if (!reactor || !driveId) return [];
  const documentIds = await reactor.getDocuments(driveId);
  const documents = await Promise.all(
    documentIds.map((id) => reactor.getDocument(id)),
  );
  return documents;
}

export async function getDrives(
  reactor: IDocumentDriveServer | undefined,
): Promise<DocumentDriveDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const drives = await Promise.all(driveIds.map((id) => reactor.getDrive(id)));
  return drives;
}

export async function getDocuments(
  reactor: IDocumentDriveServer | undefined,
): Promise<PHDocument[]> {
  if (!reactor) return [];
  const driveIds = await reactor.getDrives();
  const documentIds = await Promise.all(
    driveIds.map((id) => reactor.getDocuments(id)),
  );
  const documents = await Promise.all(
    documentIds.flat().map((id) => reactor.getDocument(id)),
  );
  return documents;
}

export async function getDriveById(
  reactor: IDocumentDriveServer | undefined,
  driveId: string | undefined,
): Promise<DocumentDriveDocument | undefined> {
  if (!reactor || !driveId) return undefined;
  return await reactor.getDrive(driveId);
}

export function getSyncStatus(
  documentId: string,
  sharingType: SharingType,
): Promise<SyncStatus | undefined> {
  if (sharingType === "LOCAL") return Promise.resolve(undefined);
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return Promise.resolve(undefined);
  }
  try {
    const syncStatus = reactor.getSyncStatus(documentId);
    if (syncStatus instanceof SynchronizationUnitNotFoundError)
      return Promise.resolve("INITIAL_SYNC");
    return Promise.resolve(syncStatus);
  } catch (error) {
    console.error(error);
    return Promise.resolve("ERROR");
  }
}

export function getSyncStatusSync(
  documentId: string,
  sharingType: SharingType,
): SyncStatus | undefined {
  if (sharingType === "LOCAL") return;
  const reactor = window.ph?.reactor;
  if (!reactor) {
    return;
  }
  try {
    const syncStatus = reactor.getSyncStatus(documentId);
    if (syncStatus instanceof SynchronizationUnitNotFoundError)
      return "INITIAL_SYNC";
    return syncStatus;
  } catch (error) {
    console.error(error);
    return "ERROR";
  }
}

export function getDrivePullResponderTrigger(
  drive: DocumentDriveDocument | undefined,
): Trigger | undefined {
  return drive?.state.local.triggers.find(
    (trigger) => trigger.type === "PullResponder",
  );
}

export function getDrivePullResponderUrl(
  drive: DocumentDriveDocument | undefined,
): string | undefined {
  const pullResponder = getDrivePullResponderTrigger(drive);
  return pullResponder?.data?.url;
}

export function getDriveRemoteUrl(
  drive: DocumentDriveDocument | undefined,
): string | undefined {
  if (!drive) return undefined;
  const pullResponderUrl = getDrivePullResponderUrl(drive);

  if ("remoteUrl" in drive.state.global) {
    const remoteUrl = drive.state.global.remoteUrl;
    if (typeof remoteUrl === "string") {
      return remoteUrl;
    }
  }

  return pullResponderUrl;
}

export function getDriveIsRemote(
  drive: DocumentDriveDocument | undefined,
): boolean {
  const remoteUrl = getDriveRemoteUrl(drive);
  const pullResponderUrl = getDrivePullResponderUrl(drive);
  return remoteUrl !== undefined || pullResponderUrl !== undefined;
}
